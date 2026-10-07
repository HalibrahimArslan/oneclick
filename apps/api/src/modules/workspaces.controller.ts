import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { createBrandSchema, inviteMemberSchema, PLATFORMS } from '@oneclick/shared';
import { z } from 'zod';
import { CurrentUser, MinRole, type AuthUser } from '../common/auth';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';

const renameSchema = z.object({ name: z.string().trim().min(2).max(80) });

@Controller('workspaces')
export class WorkspacesController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(renameSchema)) body: { name: string }) {
    const ws = await this.c.prisma.workspace.create({
      data: { name: body.name, members: { create: { userId: u.id, role: 'OWNER' } } },
    });
    return { id: ws.id, name: ws.name, role: 'OWNER' };
  }

  @Patch(':wid')
  @MinRole('ADMIN')
  async rename(@Param('wid') wid: string, @Body(new ZodPipe(renameSchema)) body: { name: string }) {
    const ws = await this.c.prisma.workspace.update({ where: { id: wid }, data: { name: body.name } });
    return { id: ws.id, name: ws.name };
  }

  /** Composer ve hesap ekranı için: hangi platformlar yapılandırılmış */
  @Get(':wid/platforms')
  platforms() {
    return PLATFORMS.map((p) => ({ platform: p, configured: this.c.providers[p].isConfigured() })).filter(
      (p) => p.platform !== 'MOCK' || p.configured,
    );
  }

  @Get(':wid/brands')
  brands(@Param('wid') wid: string) {
    return this.c.prisma.brand.findMany({ where: { workspaceId: wid }, orderBy: { name: 'asc' } });
  }

  @Post(':wid/brands')
  @MinRole('ADMIN')
  createBrand(@Param('wid') wid: string, @Body(new ZodPipe(createBrandSchema)) body: { name: string }) {
    return this.c.prisma.brand.create({ data: { workspaceId: wid, name: body.name } });
  }

  @Get(':wid/members')
  async members(@Param('wid') wid: string) {
    const ms = await this.c.prisma.workspaceMember.findMany({
      where: { workspaceId: wid },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return ms.map((m) => ({ ...m.user, role: m.role }));
  }

  /** Şimdilik yalnızca kayıtlı kullanıcıları ekler; e-posta daveti Faz 2'de. */
  @Post(':wid/members')
  @MinRole('ADMIN')
  async addMember(@Param('wid') wid: string, @Body(new ZodPipe(inviteMemberSchema)) body: z.infer<typeof inviteMemberSchema>) {
    const user = await this.c.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new NotFoundException('Bu e-postayla kayıtlı kullanıcı yok; önce kayıt olmalı');
    await this.c.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: wid, userId: user.id } },
      create: { workspaceId: wid, userId: user.id, role: body.role },
      update: { role: body.role },
    });
    return { id: user.id, name: user.name, email: user.email, role: body.role };
  }
}
