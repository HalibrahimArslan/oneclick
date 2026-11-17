import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient, SocialAccount } from '@prisma/client';
import type IORedis from 'ioredis';
import { ProviderError } from '../lib/http';
import type { ProviderRegistry, SocialProvider } from '../providers';
import { IG_COMMENTS_SCOPE, IG_MESSAGES_SCOPE, IG_REPLY_WINDOW_MS } from '../providers/instagram';
import type { ProviderComment, ProviderDirectThread, ProviderMedia } from '../providers/types';
import type { CredentialService } from './credentials';

/** Bu yaştan eski gönderilerin yorumları eşitlenmez */
const MEDIA_WINDOW_MS = 60 * 864e5;
const COUNT_TTL_S = 7 * 24 * 3600;

type AccountWithScopes = SocialAccount & { credential: { scopes: string[] } | null };

const isDemo = (a: SocialAccount) => (a.metadata as Record<string, unknown> | null)?.demo === true;

/** Yorumları okunabilen hesap: izni olan Instagram hesabı ya da demo hesabı */
export function canReadComments(a: AccountWithScopes) {
  if (isDemo(a)) return a.platform === 'INSTAGRAM';
  return a.platform === 'INSTAGRAM' && Boolean(a.credential?.scopes.includes(IG_COMMENTS_SCOPE));
}

/** Doğrudan mesajları okunabilen hesap */
export function canReadMessages(a: AccountWithScopes) {
  if (isDemo(a)) return a.platform === 'INSTAGRAM';
  return a.platform === 'INSTAGRAM' && Boolean(a.credential?.scopes.includes(IG_MESSAGES_SCOPE));
}

/** Kişinin son mesajından sonra yanıt verilebilecek son an (Meta 24 saat kuralı); gelen mesaj yoksa null */
export function replyDeadline(messages: { direction: 'IN' | 'OUT'; sentAt: Date }[]) {
  const lastIn = messages.filter((m) => m.direction === 'IN').reduce<Date | null>((d, m) => (!d || m.sentAt > d ? m.sentAt : d), null);
  return lastIn ? new Date(lastIn.getTime() + IG_REPLY_WINDOW_MS) : null;
}

/**
 * Birleşik gelen kutusu: Instagram yorumlarını periyodik olarak çeker, panelden yanıtlar ve gizler.
 * Her üst düzey yorum ve yanıtları bir konuşmadır. Yorum sayısı değişmeyen gönderi atlanır.
 */
export class InboxService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly providers: ProviderRegistry,
    private readonly credentials: CredentialService,
    private readonly redis: IORedis,
    private readonly log: (msg: string) => void = console.log,
  ) {}

  private provider(a: SocialAccount): SocialProvider {
    return isDemo(a) ? this.providers.MOCK : this.providers[a.platform];
  }

  /** Eşitlenecek hesaplar: izni olan, demo olmayan, aktif Instagram hesapları */
  async syncAll({ workspaceId }: { workspaceId?: string } = {}) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { platform: 'INSTAGRAM', status: 'ACTIVE', ...(workspaceId ? { workspaceId } : {}) },
      include: { credential: { select: { scopes: true } } },
    });
    let threads = 0;
    let newMessages = 0;
    let failed = 0;
    for (const a of accounts) {
      if (isDemo(a) || (!canReadComments(a) && !canReadMessages(a))) continue;
      try {
        const r = await this.syncAccount(a);
        threads += r.threads;
        newMessages += r.newMessages;
      } catch (err) {
        failed++;
        this.log(`yorumlar alınamadı account=${a.id}: ${err instanceof ProviderError ? `${err.opts.status ?? ''} ${err.message}` : (err as Error).message}`);
      }
    }
    return { accounts: accounts.length, threads, newMessages, failed };
  }

  async syncAccount(a: AccountWithScopes) {
    const accessToken = await this.credentials.getAccessToken(a);
    const comments = canReadComments(a) ? await this.syncComments(a, accessToken) : { threads: 0, newMessages: 0 };
    const direct = canReadMessages(a) ? await this.syncDirect(a, accessToken) : { threads: 0, newMessages: 0 };
    return { threads: comments.threads + direct.threads, newMessages: comments.newMessages + direct.newMessages };
  }

  /** Doğrudan mesajlar: yalnızca son eşitlemeden beri güncellenen konuşmalar çekilir */
  private async syncDirect(a: AccountWithScopes, accessToken: string) {
    const provider = this.provider(a);
    if (!provider.listDirectThreads) return { threads: 0, newMessages: 0 };
    const key = `inbox:dm:since:${a.id}`;
    const prev = await this.redis.get(key);
    const list = await provider.listDirectThreads({ accessToken, account: { ...this.ref(a), username: a.username }, since: prev ? new Date(prev) : null });
    let newMessages = 0;
    for (const t of list) newMessages += await this.upsertDirectThread(a, t);
    const newest = list.reduce<Date | null>((d, t) => (!d || t.updatedAt > d ? t.updatedAt : d), null);
    if (newest) await this.redis.set(key, newest.toISOString(), 'EX', 30 * 24 * 3600);
    return { threads: list.length, newMessages };
  }

  private async upsertDirectThread(a: SocialAccount, t: ProviderDirectThread) {
    const mine = (m: ProviderDirectThread['messages'][number]) =>
      (m.fromId !== null && (m.fromId === a.externalId || m.fromId !== t.participant.id)) ||
      (m.fromUsername !== null && a.username !== null && m.fromUsername.toLowerCase() === a.username.toLowerCase());
    if (!t.messages.length) return 0;
    const latest = t.messages.reduce((x, m) => (m.timestamp > x.timestamp ? m : x), t.messages[0]);
    const answered = mine(latest);
    const context = { participant: t.participant } as Prisma.InputJsonValue;

    const conv = await this.prisma.conversation.upsert({
      where: { socialAccountId_externalThreadId: { socialAccountId: a.id, externalThreadId: t.id } },
      create: { socialAccountId: a.id, kind: 'DIRECT_MESSAGE', externalThreadId: t.id, context, status: answered ? 'DONE' : 'OPEN' },
      update: { context },
      include: { messages: { select: { externalId: true } } },
    });
    const known = new Set(conv.messages.map((m) => m.externalId));
    const fresh = t.messages.filter((m) => !known.has(m.id));
    if (!fresh.length) return 0;
    await this.prisma.message.createMany({
      data: fresh.map((m) => ({
        conversationId: conv.id,
        externalId: m.id,
        direction: mine(m) ? ('OUT' as const) : ('IN' as const),
        authorName: mine(m) ? a.username : (m.fromUsername ?? t.participant.username),
        authorExternalId: m.fromId,
        body: m.text,
        attachments: m.attachments.length ? (m.attachments as Prisma.InputJsonValue) : undefined,
        sentAt: m.timestamp,
      })),
      skipDuplicates: true,
    });
    const incoming = fresh.filter((m) => !mine(m)).length;
    const reopen = conv.messages.length > 0 && incoming > 0 && !answered;
    await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: latest.timestamp, ...(reopen ? { status: 'OPEN' } : {}) } });
    return incoming;
  }

  private async syncComments(a: AccountWithScopes, accessToken: string) {
    const provider = this.provider(a);
    if (!provider.listRecentMedia || !provider.listComments) return { threads: 0, newMessages: 0 };
    const media = await provider.listRecentMedia({ accessToken, account: this.ref(a), since: new Date(Date.now() - MEDIA_WINDOW_MS) });

    let threads = 0;
    let newMessages = 0;
    for (const m of media) {
      if (!m.commentsCount) continue;
      // Yorum sayısı son eşitlemeden beri değişmediyse atla (istek sınırını korur)
      const key = `inbox:count:${a.id}:${m.id}`;
      if ((await this.redis.get(key)) === String(m.commentsCount)) continue;
      const list = await provider.listComments({ accessToken, mediaId: m.id });
      const relatedPostId = await this.relatedPostId(m.id);
      for (const t of list) {
        newMessages += await this.upsertThread(a, m, relatedPostId, [t.root, ...t.replies]);
        threads++;
      }
      await this.redis.set(key, String(m.commentsCount), 'EX', COUNT_TTL_S);
    }
    return { threads, newMessages };
  }

  /** Konuşmayı ve mesajlarını kaydeder; yeni gelen yorum varsa konuşmayı yeniden açar. Yeni gelen mesaj sayısını döner. */
  private async upsertThread(a: SocialAccount, m: ProviderMedia, relatedPostId: string | null, comments: ProviderComment[]) {
    const mine = (c: ProviderComment) =>
      (c.fromId !== null && c.fromId === a.externalId) || (c.username !== null && a.username !== null && c.username.toLowerCase() === a.username.toLowerCase());
    const context = { mediaId: m.id, permalink: m.permalink, caption: m.caption?.slice(0, 300) ?? null, thumbnailUrl: m.thumbnailUrl } as Prisma.InputJsonValue;
    const root = comments[0];
    const latest = comments.reduce((x, c) => (c.timestamp > x.timestamp ? c : x), root);
    // Son söz bizdeyse (Instagram'dan yanıtlanmış ya da kendi açıklamamız) yanıt beklemiyor
    const answered = mine(latest);

    const conv = await this.prisma.conversation.upsert({
      where: { socialAccountId_externalThreadId: { socialAccountId: a.id, externalThreadId: root.id } },
      create: { socialAccountId: a.id, kind: 'COMMENT_THREAD', externalThreadId: root.id, relatedPostId, context, status: answered ? 'DONE' : 'OPEN' },
      update: { context },
      include: { messages: { select: { externalId: true, hidden: true } } },
    });

    const known = new Map(conv.messages.map((x) => [x.externalId, x.hidden]));
    const fresh = comments.filter((c) => !known.has(c.id));
    if (fresh.length) {
      await this.prisma.message.createMany({
        data: fresh.map((c) => ({
          conversationId: conv.id,
          externalId: c.id,
          direction: mine(c) ? ('OUT' as const) : ('IN' as const),
          authorName: c.username,
          authorExternalId: c.fromId,
          body: c.text,
          hidden: c.hidden,
          sentAt: c.timestamp,
        })),
        skipDuplicates: true,
      });
    }
    // Platformda gizlenen/gösterilen yorumları eşitle
    for (const c of comments) {
      if (known.has(c.id) && known.get(c.id) !== c.hidden) {
        await this.prisma.message.updateMany({ where: { conversationId: conv.id, externalId: c.id }, data: { hidden: c.hidden } });
      }
    }

    const incoming = fresh.filter((c) => !mine(c)).length;
    if (fresh.length) {
      // Var olan konuşmaya yeni yorum geldiyse ve henüz yanıtlanmadıysa yeniden aç
      const reopen = conv.messages.length > 0 && incoming > 0 && !answered;
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: latest.timestamp, ...(reopen ? { status: 'OPEN' } : {}) } });
    }
    return incoming;
  }

  /** Panelden yanıt: platforma yazar, giden mesaj olarak kaydeder ve konuşmayı "bitti" yapar. */
  async reply(conversationId: string, userId: string, text: string) {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { account: { include: { credential: { select: { scopes: true } } } } },
    });
    const a = conv.account;
    const provider = this.provider(a);
    let res: { id: string };
    if (conv.kind === 'DIRECT_MESSAGE') {
      if (!provider.sendDirectMessage || !canReadMessages(a)) throw new BadRequestException('Bu hesap için mesaj izni yok. Hesabı yeniden bağlayın.');
      const msgs = await this.prisma.message.findMany({ where: { conversationId: conv.id }, select: { direction: true, sentAt: true } });
      const deadline = replyDeadline(msgs);
      if (!deadline || deadline.getTime() < Date.now()) {
        throw new BadRequestException('Kişinin son mesajının üzerinden 24 saatten fazla geçti; Instagram bu konuşmaya yanıt vermeye izin vermiyor.');
      }
      const participant = (conv.context as { participant?: { id: string } } | null)?.participant;
      if (!participant?.id) throw new BadRequestException('Konuşmadaki kişi bilinmiyor; gelen kutusunu yenileyin.');
      res = await provider.sendDirectMessage({ accessToken: await this.credentials.getAccessToken(a), account: this.ref(a), recipientId: participant.id, text });
    } else {
      if (!provider.replyToComment || !canReadComments(a)) throw new BadRequestException('Bu hesap için yorum yanıtlama izni yok. Hesabı yeniden bağlayın.');
      res = await provider.replyToComment({ accessToken: await this.credentials.getAccessToken(a), commentId: conv.externalThreadId, text });
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: conv.id, externalId: res.id, direction: 'OUT', authorName: a.username, body: text, sentById: userId, sentAt: now },
      }),
      this.prisma.conversation.update({ where: { id: conv.id }, data: { status: 'DONE', lastMessageAt: now } }),
    ]);
  }

  async setHidden(messageId: string, hidden: boolean) {
    const msg = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { conversation: { include: { account: { include: { credential: { select: { scopes: true } } } } } } },
    });
    if (msg.direction === 'OUT') throw new BadRequestException('Kendi yanıtınız gizlenemez');
    if (msg.conversation.kind === 'DIRECT_MESSAGE') throw new BadRequestException('Doğrudan mesajlar gizlenemez');
    const a = msg.conversation.account;
    const provider = this.provider(a);
    if (!provider.setCommentHidden || !canReadComments(a)) throw new BadRequestException('Bu hesap için yorum gizleme izni yok. Hesabı yeniden bağlayın.');
    await provider.setCommentHidden({ accessToken: await this.credentials.getAccessToken(a), commentId: msg.externalId, hidden });
    await this.prisma.message.update({ where: { id: messageId }, data: { hidden } });
  }

  private ref(a: SocialAccount) {
    return { id: a.id, accountType: a.accountType, externalId: a.externalId, metadata: (a.metadata as Record<string, any>) ?? null };
  }

  /** Yorum panelden paylaşılmış bir gönderiye mi yazılmış */
  private async relatedPostId(mediaId: string) {
    const t = await this.prisma.postTarget.findFirst({ where: { externalPostId: mediaId }, select: { postId: true } });
    return t?.postId ?? null;
  }
}
