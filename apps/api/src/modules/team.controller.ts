import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import {
  createInviteSchema,
  updateMemberSchema,
  type CreateInviteInput,
  type CreatedInviteDto,
  type InviteDto,
  type MemberDto,
} from '@oneclick/shared';
import type { Invite, Role, User } from '@prisma/client';
import { CurrentMember, CurrentUser, MinRole, NoDemo, Public, type AuthUser, type Membership } from '../common/auth';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';

const toInviteDto = (i: Invite & { createdBy: Pick<User, 'id' | 'name'> }): InviteDto => ({
  id: i.id,
  role: i.role,
  note: i.note,
  createdBy: i.createdBy,
  expiresAt: i.expiresAt.toISOString(),
  createdAt: i.createdAt.toISOString(),
});

/** Ekip: üyeler, roller ve davet linkleri. */
@Controller('workspaces/:wid')
export class TeamController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get('members')
  async members(@Param('wid') wid: string): Promise<MemberDto[]> {
    const ms = await this.c.prisma.workspaceMember.findMany({
      where: { workspaceId: wid },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return ms.map((m) => ({ ...m.user, role: m.role }));
  }

  @Patch('members/:userId')
  @MinRole('ADMIN')
  @NoDemo()
  async updateMember(
    @Param('wid') wid: string,
    @Param('userId') userId: string,
    @CurrentUser() u: AuthUser,
    @CurrentMember() me: Membership,
    @Body(new ZodPipe(updateMemberSchema)) body: { role: Role },
  ): Promise<MemberDto> {
    const target = await this.member(wid, userId);
    if (target.role === 'OWNER') await this.assertCanTouchOwner(wid, me);
    const m = await this.c.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: wid, userId } },
      data: { role: body.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await this.audit(wid, u.id, 'member.role_changed', userId, { from: target.role, to: body.role });
    return { ...m.user, role: m.role };
  }

  /** Üyeyi çıkarır. Herkes kendini çıkarabilir (ayrılma); başkasını çıkarmak Yönetici/Sahip işidir. */
  @Delete('members/:userId')
  @HttpCode(204)
  async removeMember(@Param('wid') wid: string, @Param('userId') userId: string, @CurrentUser() u: AuthUser, @CurrentMember() me: Membership) {
    const self = userId === u.id;
    if (!self && me.role !== 'OWNER' && me.role !== 'ADMIN') throw new ForbiddenException('Bu işlem için yetkiniz yok');
    if (!self && me.isDemo) throw new ForbiddenException('Bu işlem demo hesabında kapalı.');
    const target = await this.member(wid, userId);
    if (target.role === 'OWNER') await this.assertCanTouchOwner(wid, me, self);
    await this.c.prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: wid, userId } } });
    await this.audit(wid, u.id, self ? 'member.left' : 'member.removed', userId);
  }

  // ---------- Davetler ----------

  @Get('invites')
  @MinRole('ADMIN')
  async invites(@Param('wid') wid: string): Promise<InviteDto[]> {
    const items = await this.c.prisma.invite.findMany({
      where: { workspaceId: wid, acceptedAt: null, expiresAt: { gt: new Date() } },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(toInviteDto);
  }

  @Post('invites')
  @MinRole('ADMIN')
  @NoDemo()
  async createInvite(
    @Param('wid') wid: string,
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<CreatedInviteDto> {
    const { invite, token } = await this.c.invites.create(wid, u.id, body.role, body.note);
    await this.audit(wid, u.id, 'invite.created', invite.id, { role: body.role });
    return { ...toInviteDto(invite), token };
  }

  @Delete('invites/:id')
  @MinRole('ADMIN')
  @HttpCode(204)
  async revokeInvite(@Param('wid') wid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    const { count } = await this.c.prisma.invite.deleteMany({ where: { id, workspaceId: wid, acceptedAt: null } });
    if (!count) throw new NotFoundException('Davet bulunamadı');
    await this.audit(wid, u.id, 'invite.revoked', id);
  }

  // ---------- yardımcılar ----------

  private async member(wid: string, userId: string) {
    const m = await this.c.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: wid, userId } } });
    if (!m) throw new NotFoundException('Üye bulunamadı');
    return m;
  }

  /** Sahiplere yalnızca Sahip dokunabilir (kendi ayrılması hariç) ve çalışma alanı sahipsiz kalamaz. */
  private async assertCanTouchOwner(wid: string, me: Membership, self = false) {
    if (!self && me.role !== 'OWNER') throw new ForbiddenException('Sahibin rolünü yalnızca başka bir Sahip değiştirebilir');
    const owners = await this.c.prisma.workspaceMember.count({ where: { workspaceId: wid, role: 'OWNER' } });
    if (owners <= 1) throw new BadRequestException('Çalışma alanının en az bir Sahibi olmalı');
  }

  private audit(wid: string, actorId: string, action: string, entityId: string, data?: Record<string, string>) {
    return this.c.prisma.auditLog.create({ data: { workspaceId: wid, actorId, action, entity: 'member', entityId, data } });
  }
}

/** Davet linkinin açtığı sayfa için: giriş gerektirmeyen önizleme ve giriş yapmış kullanıcının kabulü. */
@Controller('invites')
export class InvitesController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Public()
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.c.invites.preview(token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  async accept(@Param('token') token: string, @CurrentUser() u: AuthUser) {
    const user = await this.c.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { id: true, isDemo: true } });
    return this.c.prisma.$transaction((tx) => this.c.invites.accept(token, user, tx));
  }
}
