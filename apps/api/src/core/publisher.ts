import type { Prisma, PrismaClient } from '@prisma/client';
import { UnrecoverableError, type Job } from 'bullmq';
import { validateForPlatform, hasErrors } from '@oneclick/shared';
import { ProviderError } from '../lib/http';
import type { ProviderRegistry, PublishMedia } from '../providers';
import type { CredentialService } from './credentials';
import type { PublishJobData } from './queues';
import type { SchedulerService } from './scheduler';
import type { Storage } from './storage';

/** Kuyruktaki tek bir hedefi (gönderi × hesap) yayınlar. */
export class PublishProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly providers: ProviderRegistry,
    private readonly credentials: CredentialService,
    private readonly storage: Storage,
    private readonly scheduler: SchedulerService,
    private readonly log: (msg: string, extra?: unknown) => void = console.log,
  ) {}

  async process(job: Job<PublishJobData>) {
    const { targetId } = job.data;
    const target = await this.prisma.postTarget.findUnique({
      where: { id: targetId },
      include: {
        account: true,
        post: { include: { media: { include: { media: true }, orderBy: { position: 'asc' } } } },
      },
    });

    // Eski (yeniden zamanlanmış/iptal edilmiş) işleri atla
    if (!target || target.jobId !== job.id) return { skipped: 'stale' };
    if (target.status === 'PUBLISHED') return { skipped: 'already_published' };

    const attemptNo = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const attempt = await this.prisma.publishAttempt.create({ data: { postTargetId: target.id, attemptNo } });
    await this.prisma.postTarget.update({ where: { id: target.id }, data: { status: 'PUBLISHING' } });
    await this.scheduler.refreshPostStatus(target.postId);

    try {
      const account = target.account;
      if (account.status === 'DISCONNECTED') {
        throw new ProviderError('Hesap bağlantısı kaldırılmış', { retryable: false, code: 'disconnected' });
      }
      const provider = this.providers[account.platform];
      const text = target.textOverride ?? target.post.text;
      const options = (target.options as Record<string, any>) ?? {};
      const media: PublishMedia[] = target.post.media.map(({ media: m }) => ({
        id: m.id,
        url: this.storage.publicUrl(m.storageKey),
        mime: m.mime,
        width: m.width,
        height: m.height,
        durationS: m.durationS,
        sizeBytes: m.sizeBytes,
        read: () => this.storage.read(m.storageKey),
      }));

      // Son kontrol: kurallar planlamadan sonra değişmiş olabilir
      const issues = validateForPlatform(account.platform, { text, media, options });
      if (hasErrors(issues)) {
        throw new ProviderError(issues.filter((i) => i.level === 'error').map((i) => i.message).join(' '), {
          retryable: false,
          code: 'validation',
        });
      }

      const accessToken = await this.credentials.getAccessToken(account);
      const result = await provider.publish({
        account: {
          id: account.id,
          accountType: account.accountType,
          externalId: account.externalId,
          metadata: (account.metadata as Record<string, any>) ?? null,
        },
        accessToken,
        text,
        media,
        options,
        state: (target.providerState as Record<string, any>) ?? {},
        saveState: async (state) => {
          await this.prisma.postTarget.update({
            where: { id: target.id },
            data: { providerState: state as Prisma.InputJsonValue },
          });
        },
      });

      await this.prisma.$transaction([
        this.prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: 'PUBLISHED',
            externalPostId: result.externalPostId,
            permalink: result.permalink ?? null,
            publishedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        }),
        this.prisma.publishAttempt.update({
          where: { id: attempt.id },
          data: { finishedAt: new Date(), result: 'success', rawResponse: result.raw === undefined ? undefined : (result.raw as Prisma.InputJsonValue) },
        }),
      ]);
      await this.scheduler.refreshPostStatus(target.postId);
      this.log(`yayınlandı target=${target.id} platform=${account.platform} id=${result.externalPostId}`);
      return { externalPostId: result.externalPostId };
    } catch (err) {
      const pe = err instanceof ProviderError ? err : null;
      const retryable = pe ? pe.retryable : true;
      const willRetry = retryable && attemptNo < maxAttempts;
      const message = (err as Error).message;

      if (pe?.opts.reauth && target.account.status === 'ACTIVE') {
        await this.credentials.markReauth(target.account, message);
      }

      await this.prisma.$transaction([
        this.prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: willRetry ? 'QUEUED' : 'FAILED',
            errorCode: pe?.opts.code ?? 'unexpected',
            errorMessage: willRetry ? `${message} (yeniden denenecek)` : message,
          },
        }),
        this.prisma.publishAttempt.update({
          where: { id: attempt.id },
          data: {
            finishedAt: new Date(),
            result: willRetry ? 'retry' : 'failed',
            errorMessage: message,
            rawResponse: pe?.opts.body === undefined ? undefined : (pe.opts.body as Prisma.InputJsonValue),
          },
        }),
      ]);
      await this.scheduler.refreshPostStatus(target.postId);
      this.log(`hata target=${target.id} retry=${willRetry}: ${message}`);

      if (!willRetry) throw new UnrecoverableError(message);
      throw err;
    }
  }
}
