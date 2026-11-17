import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import {
  createBrandSchema,
  savePlatformAppSchema,
  updateBrandSchema,
  updateWorkspaceSettingsSchema,
  type BrandDto,
  type Platform,
  type SavePlatformAppInput,
} from '@oneclick/shared';
import { z } from 'zod';
import { CurrentUser, MinRole, NoDemo, type AuthUser } from '../common/auth';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';
import { REAL_PLATFORMS } from '../core/platform-apps';

const renameSchema = z.object({ name: z.string().trim().min(2).max(80) });

@Controller('workspaces')
export class WorkspacesController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(renameSchema)) body: { name: string }) {
    const user = await this.c.prisma.user.findUnique({ where: { id: u.id }, select: { isDemo: true } });
    if (user?.isDemo) throw new ForbiddenException('Demo hesabında yeni çalışma alanı açılamaz.');
    const ws = await this.c.prisma.workspace.create({
      data: { name: body.name, members: { create: { userId: u.id, role: 'OWNER' } } },
    });
    return { id: ws.id, name: ws.name, role: 'OWNER' };
  }

  /** Çalışma alanı adı ve "onay zorunlu" ayarı */
  @Patch(':wid')
  @MinRole('ADMIN')
  async update(
    @Param('wid') wid: string,
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(updateWorkspaceSettingsSchema)) body: z.infer<typeof updateWorkspaceSettingsSchema>,
  ) {
    const ws = await this.c.prisma.workspace.update({ where: { id: wid }, data: { name: body.name, approvalRequired: body.approvalRequired } });
    if (body.approvalRequired !== undefined) {
      await this.audit(wid, u.id, 'workspace.approval_required', { value: String(body.approvalRequired) });
    }
    return { id: ws.id, name: ws.name, approvalRequired: ws.approvalRequired };
  }

  /** Composer ve hesap ekranı için: hangi platformlar bağlanabilir */
  @Get(':wid/platforms')
  platforms(@Param('wid') wid: string) {
    return this.c.platformApps.configured(wid);
  }

  // ---------- Platform uygulamaları (çalışma alanının kendi App ID / Secret'ı) ----------

  @Get(':wid/platform-apps')
  @MinRole('ADMIN')
  platformApps(@Param('wid') wid: string) {
    return this.c.platformApps.list(wid);
  }

  @Put(':wid/platform-apps/:platform')
  @MinRole('ADMIN')
  @NoDemo()
  async savePlatformApp(
    @Param('wid') wid: string,
    @Param('platform') platformParam: string,
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(savePlatformAppSchema)) body: SavePlatformAppInput,
  ) {
    const platform = this.parseRealPlatform(platformParam);
    let result: 'created' | 'updated';
    try {
      result = await this.c.platformApps.save(wid, platform, body);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.audit(wid, u.id, `platform_app.${result}`, { platform });
    return (await this.c.platformApps.list(wid)).find((a) => a.platform === platform);
  }

  @Delete(':wid/platform-apps/:platform')
  @MinRole('ADMIN')
  @NoDemo()
  @HttpCode(204)
  async removePlatformApp(@Param('wid') wid: string, @Param('platform') platformParam: string, @CurrentUser() u: AuthUser) {
    const platform = this.parseRealPlatform(platformParam);
    await this.c.platformApps.remove(wid, platform);
    await this.audit(wid, u.id, 'platform_app.removed', { platform });
  }

  // ---------- Müşteriler (Brand) ----------

  @Get(':wid/brands')
  async brands(@Param('wid') wid: string): Promise<BrandDto[]> {
    const rows = await this.c.prisma.brand.findMany({
      where: { workspaceId: wid },
      orderBy: { name: 'asc' },
      include: { _count: { select: { accounts: { where: { status: { not: 'DISCONNECTED' } } } } } },
    });
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      logoUrl: b.logoUrl,
      accountCount: b._count.accounts,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  @Post(':wid/brands')
  @MinRole('ADMIN')
  async createBrand(@Param('wid') wid: string, @Body(new ZodPipe(createBrandSchema)) body: { name: string }): Promise<BrandDto> {
    const b = await this.c.prisma.brand.create({ data: { workspaceId: wid, name: body.name } });
    return { id: b.id, name: b.name, logoUrl: b.logoUrl, accountCount: 0, createdAt: b.createdAt.toISOString() };
  }

  @Patch(':wid/brands/:id')
  @MinRole('ADMIN')
  async updateBrand(@Param('wid') wid: string, @Param('id') id: string, @Body(new ZodPipe(updateBrandSchema)) body: { name: string }) {
    const { count } = await this.c.prisma.brand.updateMany({ where: { id, workspaceId: wid }, data: { name: body.name } });
    if (!count) throw new NotFoundException('Müşteri bulunamadı');
    return { id, name: body.name };
  }

  /** Müşteriyi siler; hesapları ve gönderileri silinmez, yalnızca müşteri bağlantısı kalkar. */
  @Delete(':wid/brands/:id')
  @MinRole('ADMIN')
  @HttpCode(204)
  async deleteBrand(@Param('wid') wid: string, @Param('id') id: string) {
    const { count } = await this.c.prisma.brand.deleteMany({ where: { id, workspaceId: wid } });
    if (!count) throw new NotFoundException('Müşteri bulunamadı');
  }

  private parseRealPlatform(p: string): Platform {
    const up = p.toUpperCase() as Platform;
    if (!(REAL_PLATFORMS as Platform[]).includes(up)) throw new BadRequestException('Bilinmeyen platform');
    return up;
  }

  private audit(workspaceId: string, actorId: string, action: string, data: Record<string, string>) {
    return this.c.prisma.auditLog.create({ data: { workspaceId, actorId, action, entity: 'workspace', data } });
  }
}
