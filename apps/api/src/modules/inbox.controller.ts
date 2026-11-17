import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createLabelSchema,
  hideMessageSchema,
  inboxQuerySchema,
  replySchema,
  updateConversationSchema,
  type ConversationDetailDto,
  type ConversationDto,
  type InboxDto,
  type InboxMessageDto,
  type LabelDto,
} from '@oneclick/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { CurrentUser, MinRole, type AuthUser } from '../common/auth';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';
import { canReadComments, canReadMessages } from '../core/inbox';
import { IG_REPLY_WINDOW_MS } from '../providers/instagram';

const SYNC_COOLDOWN_S = 60;

const USER_REF = { select: { id: true, name: true } } as const;
const CONVERSATION_INCLUDE = {
  account: { select: { id: true, name: true, username: true, avatarUrl: true, platform: true } },
  assignee: USER_REF,
  labels: { include: { label: { select: { id: true, name: true } } } },
  messages: { orderBy: { sentAt: 'desc' as const }, take: 1 },
  _count: { select: { messages: true } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

/** lastInAt: kişinin son mesajı (DM yanıt süresi için) */
const toConversationDto = (c: ConversationRow, lastInAt: Date | null): ConversationDto => {
  const ctx = c.context as {
    permalink?: string | null;
    caption?: string | null;
    thumbnailUrl?: string | null;
    participant?: { username: string | null };
  } | null;
  const last = c.messages[0];
  const dm = c.kind === 'DIRECT_MESSAGE';
  return {
    id: c.id,
    kind: dm ? 'DM' : 'COMMENT',
    status: c.status,
    participant: dm ? { username: ctx?.participant?.username ?? null } : null,
    replyDeadline: dm && lastInAt ? new Date(lastInAt.getTime() + IG_REPLY_WINDOW_MS).toISOString() : null,
    account: c.account,
    context: !dm && ctx ? { permalink: ctx.permalink ?? null, caption: ctx.caption ?? null, thumbnailUrl: ctx.thumbnailUrl ?? null } : null,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    preview: last ? { direction: last.direction, authorName: last.authorName, body: last.body } : null,
    messageCount: c._count.messages,
    assignee: c.assignee,
    labels: c.labels.map((l) => l.label),
  };
};

/** Birleşik gelen kutusu: Instagram yorumları. Okuma herkese, yanıt/gizleme/atama Editör ve üstüne açık. */
@Controller('workspaces/:wid')
export class InboxController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get('inbox')
  async list(@Param('wid') wid: string, @CurrentUser() u: AuthUser, @Query(new ZodPipe(inboxQuerySchema)) q: z.infer<typeof inboxQuerySchema>): Promise<InboxDto> {
    const scope: Prisma.ConversationWhereInput = {
      account: { workspaceId: wid },
      ...(q.accountId ? { socialAccountId: q.accountId } : {}),
      ...(q.kind ? { kind: q.kind === 'DM' ? 'DIRECT_MESSAGE' : 'COMMENT_THREAD' } : {}),
    };
    const where: Prisma.ConversationWhereInput = {
      ...scope,
      status: q.status,
      ...(q.assignee === 'me' ? { assigneeId: u.id } : q.assignee === 'unassigned' ? { assigneeId: null } : {}),
      ...(q.labelId ? { labels: { some: { labelId: q.labelId } } } : {}),
    };
    const [rows, open, mine, done, accounts] = await Promise.all([
      this.c.prisma.conversation.findMany({ where, include: CONVERSATION_INCLUDE, orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }], take: 200 }),
      this.c.prisma.conversation.count({ where: { ...scope, status: 'OPEN' } }),
      this.c.prisma.conversation.count({ where: { ...scope, status: 'OPEN', assigneeId: u.id } }),
      this.c.prisma.conversation.count({ where: { ...scope, status: 'DONE' } }),
      this.c.prisma.socialAccount.findMany({
        where: { workspaceId: wid, platform: 'INSTAGRAM', status: { not: 'DISCONNECTED' } },
        include: { credential: { select: { scopes: true } } },
      }),
    ]);
    const lastIn = await this.lastInbound(rows.filter((r) => r.kind === 'DIRECT_MESSAGE').map((r) => r.id));
    return {
      conversations: rows.map((r) => toConversationDto(r, lastIn.get(r.id) ?? null)),
      counts: { open, mine, done },
      needsReconnect: accounts
        .map((a) => ({
          id: a.id,
          name: a.name,
          missing: [...(canReadComments(a) ? [] : ['comments' as const]), ...(canReadMessages(a) ? [] : ['messages' as const])],
        }))
        .filter((a) => a.missing.length),
      hasSupportedAccounts: accounts.some((a) => canReadComments(a) || canReadMessages(a)),
    };
  }

  @Get('inbox/:id')
  async get(@Param('wid') wid: string, @Param('id') id: string): Promise<ConversationDetailDto> {
    const conv = await this.load(wid, id);
    const messages = await this.c.prisma.message.findMany({ where: { conversationId: id }, include: { sentBy: USER_REF }, orderBy: { sentAt: 'asc' } });
    const lastIn = messages.filter((m) => m.direction === 'IN').at(-1)?.sentAt ?? null;
    return {
      ...toConversationDto(conv, lastIn),
      messages: messages.map(
        (m): InboxMessageDto => ({
          id: m.id,
          direction: m.direction,
          authorName: m.authorName,
          body: m.body,
          hidden: m.hidden,
          sentAt: m.sentAt.toISOString(),
          sentBy: m.sentBy,
          attachments: (m.attachments as InboxMessageDto['attachments'] | null) ?? [],
        }),
      ),
    };
  }

  @Post('inbox/:id/reply')
  @MinRole('EDITOR')
  @HttpCode(200)
  async reply(@Param('wid') wid: string, @Param('id') id: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(replySchema)) body: { text: string }) {
    await this.load(wid, id);
    await this.c.inbox.reply(id, u.id, body.text);
    await this.audit(wid, u.id, 'inbox.replied', id);
    return this.get(wid, id);
  }

  /** Durum, atanan kişi ve etiketler */
  @Patch('inbox/:id')
  @MinRole('EDITOR')
  async update(@Param('wid') wid: string, @Param('id') id: string, @Body(new ZodPipe(updateConversationSchema)) body: z.infer<typeof updateConversationSchema>) {
    await this.load(wid, id);
    if (body.assigneeId) {
      const member = await this.c.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: wid, userId: body.assigneeId } } });
      if (!member) throw new BadRequestException('Atanan kişi bu çalışma alanının üyesi değil');
    }
    if (body.labelIds) {
      const n = await this.c.prisma.label.count({ where: { id: { in: body.labelIds }, workspaceId: wid } });
      if (n !== new Set(body.labelIds).size) throw new BadRequestException('Etiketlerden biri bulunamadı');
    }
    await this.c.prisma.$transaction([
      this.c.prisma.conversation.update({ where: { id }, data: { status: body.status, assigneeId: body.assigneeId } }),
      ...(body.labelIds
        ? [
            this.c.prisma.conversationLabel.deleteMany({ where: { conversationId: id } }),
            this.c.prisma.conversationLabel.createMany({ data: [...new Set(body.labelIds)].map((labelId) => ({ conversationId: id, labelId })) }),
          ]
        : []),
    ]);
    return this.get(wid, id);
  }

  @Post('inbox/messages/:mid/hide')
  @MinRole('EDITOR')
  @HttpCode(200)
  async hide(@Param('wid') wid: string, @Param('mid') mid: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(hideMessageSchema)) body: { hidden: boolean }) {
    const msg = await this.c.prisma.message.findFirst({ where: { id: mid, conversation: { account: { workspaceId: wid } } } });
    if (!msg) throw new NotFoundException('Yorum bulunamadı');
    await this.c.inbox.setHidden(mid, body.hidden);
    await this.audit(wid, u.id, body.hidden ? 'inbox.hidden' : 'inbox.unhidden', msg.conversationId);
    return this.get(wid, msg.conversationId);
  }

  /** "Yenile": bu çalışma alanının hesaplarını hemen eşitler (dakikada bir) */
  @Post('inbox/sync')
  @HttpCode(200)
  async sync(@Param('wid') wid: string) {
    const key = `inbox:sync:${wid}`;
    if (!(await this.c.redis.set(key, '1', 'EX', SYNC_COOLDOWN_S, 'NX'))) {
      throw new HttpException('Yorumlar az önce yenilendi. Bir dakika sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.c.inbox.syncAll({ workspaceId: wid });
  }

  // ---------- Etiketler ----------

  @Get('labels')
  async labels(@Param('wid') wid: string): Promise<LabelDto[]> {
    return this.c.prisma.label.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  @Post('labels')
  @MinRole('EDITOR')
  async createLabel(@Param('wid') wid: string, @Body(new ZodPipe(createLabelSchema)) body: { name: string }): Promise<LabelDto> {
    return this.c.prisma.label.upsert({
      where: { workspaceId_name: { workspaceId: wid, name: body.name } },
      create: { workspaceId: wid, name: body.name },
      update: {},
      select: { id: true, name: true },
    });
  }

  @Delete('labels/:id')
  @MinRole('ADMIN')
  @HttpCode(204)
  async deleteLabel(@Param('wid') wid: string, @Param('id') id: string) {
    const { count } = await this.c.prisma.label.deleteMany({ where: { id, workspaceId: wid } });
    if (!count) throw new NotFoundException('Etiket bulunamadı');
  }

  /** DM konuşmalarında kişinin son mesaj zamanı (tek sorgu) */
  private async lastInbound(ids: string[]) {
    if (!ids.length) return new Map<string, Date>();
    const rows = await this.c.prisma.message.groupBy({ by: ['conversationId'], where: { conversationId: { in: ids }, direction: 'IN' }, _max: { sentAt: true } });
    return new Map(rows.filter((r) => r._max.sentAt).map((r) => [r.conversationId, r._max.sentAt!]));
  }

  private async load(wid: string, id: string) {
    const conv = await this.c.prisma.conversation.findFirst({ where: { id, account: { workspaceId: wid } }, include: CONVERSATION_INCLUDE });
    if (!conv) throw new NotFoundException('Konuşma bulunamadı');
    return conv;
  }

  private audit(wid: string, actorId: string, action: string, entityId: string) {
    return this.c.prisma.auditLog.create({ data: { workspaceId: wid, actorId, action, entity: 'conversation', entityId } });
  }
}
