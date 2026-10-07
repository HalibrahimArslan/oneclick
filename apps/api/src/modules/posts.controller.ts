import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  hasErrors,
  instagramOptionsSchema,
  listPostsQuerySchema,
  reschedulePostSchema,
  tiktokOptionsSchema,
  upsertPostSchema,
  validateForPlatform,
  type Platform,
  type UpsertPostInput,
  type ValidationIssue,
} from '@oneclick/shared';
import { z } from 'zod';
import { CurrentUser, MinRole, type AuthUser } from '../common/auth';
import { InjectContainer } from '../common/core';
import { POST_INCLUDE, toPostDto } from '../common/serializers';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';

const LOCKED = ['PUBLISHING', 'PUBLISHED'] as const;

const normalizeOptions = (platform: Platform, options: Record<string, unknown> | null | undefined) => {
  if (platform === 'INSTAGRAM') return instagramOptionsSchema.parse(options ?? {});
  if (platform === 'TIKTOK') return tiktokOptionsSchema.parse(options ?? {});
  return options ?? {};
};

@Controller('workspaces/:wid')
export class PostsController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get('posts')
  async list(@Param('wid') wid: string, @Query(new ZodPipe(listPostsQuerySchema)) q: z.infer<typeof listPostsQuerySchema>) {
    const where: Prisma.PostWhereInput = { workspaceId: wid };
    if (q.brandId) where.brandId = q.brandId;
    if (q.status) where.status = { in: q.status.split(',') as never };
    if (q.from || q.to) {
      const range = { gte: q.from ? new Date(q.from) : undefined, lt: q.to ? new Date(q.to) : undefined };
      where.OR = [
        { scheduledAt: range },
        { scheduledAt: null, publishedAt: range },
        { scheduledAt: null, publishedAt: null, createdAt: range },
      ];
    }
    const posts = await this.c.prisma.post.findMany({
      where,
      include: POST_INCLUDE,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return posts.map((p) => toPostDto(p, this.c.storage));
  }

  @Get('posts/:id')
  async get(@Param('wid') wid: string, @Param('id') id: string) {
    return toPostDto(await this.load(wid, id), this.c.storage);
  }

  /** Kaydetmeden önce composer'ın çağırdığı kontrol. */
  @Post('posts/validate')
  @HttpCode(200)
  async validate(@Param('wid') wid: string, @Body() body: unknown) {
    const input = upsertPostSchema.safeParse({ ...(body as object), mode: 'draft' });
    if (!input.success) throw new BadRequestException(input.error.issues[0]?.message);
    return this.check(wid, input.data);
  }

  @Post('posts')
  @MinRole('EDITOR')
  async create(@Param('wid') wid: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(upsertPostSchema)) body: UpsertPostInput) {
    const checked = await this.check(wid, body);
    this.assertPublishable(body, checked);
    const post = await this.c.prisma.post.create({
      data: {
        workspaceId: wid,
        authorId: u.id,
        brandId: body.brandId ?? null,
        text: body.text,
        status: body.mode === 'draft' ? 'DRAFT' : 'SCHEDULED',
        scheduledAt: this.when(body),
        media: { create: body.mediaIds.map((mediaAssetId, position) => ({ mediaAssetId, position })) },
        targets: {
          create: checked.targets.map((t) => ({
            socialAccountId: t.socialAccountId,
            textOverride: t.textOverride,
            options: t.options as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await this.afterSave(wid, u.id, post.id, body, 'post.created');
    return this.get(wid, post.id);
  }

  @Put('posts/:id')
  @MinRole('EDITOR')
  async update(
    @Param('wid') wid: string,
    @Param('id') id: string,
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(upsertPostSchema)) body: UpsertPostInput,
  ) {
    const existing = await this.load(wid, id);
    if ((LOCKED as readonly string[]).includes(existing.status)) {
      throw new ConflictException('Yayınlanan veya yayınlanmakta olan gönderi düzenlenemez');
    }
    const checked = await this.check(wid, body);
    this.assertPublishable(body, checked);
    await this.c.scheduler.unschedulePost(id);
    await this.c.prisma.$transaction([
      this.c.prisma.postMedia.deleteMany({ where: { postId: id } }),
      this.c.prisma.postTarget.deleteMany({ where: { postId: id } }),
      this.c.prisma.post.update({
        where: { id },
        data: {
          brandId: body.brandId ?? null,
          text: body.text,
          status: body.mode === 'draft' ? 'DRAFT' : 'SCHEDULED',
          scheduledAt: this.when(body),
          media: { create: body.mediaIds.map((mediaAssetId, position) => ({ mediaAssetId, position })) },
          targets: {
            create: checked.targets.map((t) => ({
              socialAccountId: t.socialAccountId,
              textOverride: t.textOverride,
              options: t.options as Prisma.InputJsonValue,
            })),
          },
        },
      }),
    ]);
    await this.afterSave(wid, u.id, id, body, 'post.updated');
    return this.get(wid, id);
  }

  /** Takvimde sürükle-bırak. */
  @Patch('posts/:id/schedule')
  @MinRole('EDITOR')
  async reschedule(
    @Param('wid') wid: string,
    @Param('id') id: string,
    @Body(new ZodPipe(reschedulePostSchema)) body: { scheduledAt: string },
  ) {
    const post = await this.load(wid, id);
    if ((LOCKED as readonly string[]).includes(post.status)) throw new ConflictException('Bu gönderi artık taşınamaz');
    const at = new Date(body.scheduledAt);
    if (at.getTime() < Date.now() - 60_000) throw new BadRequestException('Geçmiş bir zamana taşınamaz');
    await this.c.prisma.post.update({ where: { id }, data: { scheduledAt: at } });
    if (post.status === 'SCHEDULED' || post.status === 'FAILED' || post.status === 'PARTIALLY_FAILED') {
      await this.c.scheduler.schedulePost(id, at);
      await this.c.scheduler.refreshPostStatus(id);
    }
    return this.get(wid, id);
  }

  @Post('posts/:id/publish-now')
  @MinRole('EDITOR')
  @HttpCode(200)
  async publishNow(@Param('wid') wid: string, @Param('id') id: string) {
    const post = await this.load(wid, id);
    if ((LOCKED as readonly string[]).includes(post.status)) throw new ConflictException('Gönderi zaten yayında');
    const checked = await this.check(wid, {
      text: post.text,
      mediaIds: post.media.map((m) => m.mediaAssetId),
      targets: post.targets.map((t) => ({
        socialAccountId: t.socialAccountId,
        textOverride: t.textOverride,
        options: t.options as Record<string, unknown>,
      })),
      mode: 'now',
    } as UpsertPostInput);
    if (checked.hasErrors) throw new BadRequestException({ message: 'Gönderide hatalar var', targets: checked.targets });
    const now = new Date();
    await this.c.prisma.post.update({ where: { id }, data: { scheduledAt: now, status: 'SCHEDULED' } });
    await this.c.scheduler.schedulePost(id, now);
    await this.c.scheduler.refreshPostStatus(id);
    return this.get(wid, id);
  }

  @Post('post-targets/:tid/retry')
  @MinRole('EDITOR')
  @HttpCode(200)
  async retry(@Param('wid') wid: string, @Param('tid') tid: string) {
    const t = await this.c.prisma.postTarget.findFirst({ where: { id: tid, post: { workspaceId: wid } }, include: { account: true } });
    if (!t) throw new NotFoundException();
    if (t.status !== 'FAILED') throw new ConflictException('Yalnızca başarısız hedefler yeniden denenebilir');
    if (t.account.status !== 'ACTIVE') throw new ConflictException('Önce hesabı yeniden bağlayın');
    await this.c.scheduler.enqueueTarget(t.id, new Date(), t.jobId);
    await this.c.scheduler.refreshPostStatus(t.postId);
    return this.get(wid, t.postId);
  }

  /** Gönderiyi siler. Platformda yayınlanmış içerik platformdan silinmez. */
  @Delete('posts/:id')
  @MinRole('EDITOR')
  @HttpCode(204)
  async remove(@Param('wid') wid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    const post = await this.load(wid, id);
    if (post.status === 'PUBLISHING') throw new ConflictException('Yayınlanırken silinemez, birkaç saniye sonra tekrar deneyin');
    await this.c.scheduler.unschedulePost(id);
    await this.c.prisma.post.delete({ where: { id } });
    await this.audit(wid, u.id, 'post.deleted', id);
  }

  // ---------- yardımcılar ----------

  private async load(wid: string, id: string) {
    const post = await this.c.prisma.post.findFirst({ where: { id, workspaceId: wid }, include: POST_INCLUDE });
    if (!post) throw new NotFoundException('Gönderi bulunamadı');
    return post;
  }

  private when(body: UpsertPostInput) {
    if (body.mode === 'now') return new Date();
    if (body.mode === 'schedule') return new Date(body.scheduledAt!);
    return body.scheduledAt ? new Date(body.scheduledAt) : null;
  }

  private async afterSave(wid: string, userId: string, postId: string, body: UpsertPostInput, action: string) {
    if (body.mode !== 'draft') {
      await this.c.scheduler.schedulePost(postId, this.when(body)!);
      await this.c.scheduler.refreshPostStatus(postId);
    }
    await this.audit(wid, userId, action, postId, { mode: body.mode });
  }

  private audit(wid: string, actorId: string, action: string, entityId: string, data?: Prisma.InputJsonValue) {
    return this.c.prisma.auditLog.create({ data: { workspaceId: wid, actorId, action, entity: 'post', entityId, data } });
  }

  private assertPublishable(body: UpsertPostInput, checked: Awaited<ReturnType<PostsController['check']>>) {
    if (body.mode !== 'draft' && checked.hasErrors) {
      throw new BadRequestException({ message: 'Gönderide düzeltilmesi gereken hatalar var', targets: checked.targets });
    }
  }

  /** Hesapları, medyayı ve her hedefi platform kurallarına göre doğrular. */
  private async check(wid: string, body: Pick<UpsertPostInput, 'text' | 'mediaIds' | 'targets'>) {
    const accountIds = body.targets.map((t) => t.socialAccountId);
    if (new Set(accountIds).size !== accountIds.length) throw new BadRequestException('Aynı hesap iki kez seçilmiş');

    const [accounts, media] = await Promise.all([
      this.c.prisma.socialAccount.findMany({ where: { id: { in: accountIds }, workspaceId: wid } }),
      this.c.prisma.mediaAsset.findMany({ where: { id: { in: body.mediaIds }, workspaceId: wid, status: 'READY' } }),
    ]);
    if (accounts.length !== accountIds.length) throw new BadRequestException('Seçilen hesaplardan biri bulunamadı');
    if (media.length !== new Set(body.mediaIds).size) throw new BadRequestException('Seçilen medyalardan biri bulunamadı');
    const orderedMedia = body.mediaIds.map((id) => media.find((m) => m.id === id)!);

    const targets = body.targets.map((t) => {
      const account = accounts.find((a) => a.id === t.socialAccountId)!;
      const options = normalizeOptions(account.platform, t.options);
      const issues: ValidationIssue[] = validateForPlatform(account.platform, {
        text: t.textOverride ?? body.text,
        media: orderedMedia,
        options,
      });
      if (account.status !== 'ACTIVE') {
        issues.unshift({ level: 'error', code: 'account_inactive', message: 'Hesabın yeniden bağlanması gerekiyor.' });
      }
      return { socialAccountId: t.socialAccountId, platform: account.platform, textOverride: t.textOverride ?? null, options, issues };
    });
    return { targets, hasErrors: targets.some((t) => hasErrors(t.issues)) };
  }
}
