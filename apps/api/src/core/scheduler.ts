import type { PostStatus, PrismaClient, TargetStatus } from '@prisma/client';
import type { Queues } from './queues';

/** Gönderi hedeflerini kuyruğa yazar, iptal eder ve gönderi durumunu hesaplar. */
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queues: Queues,
  ) {}

  /** Gönderinin tüm yayınlanmamış hedeflerini `at` zamanına planlar (geçmişse hemen). */
  async schedulePost(postId: string, at: Date) {
    const targets = await this.prisma.postTarget.findMany({
      where: { postId, status: { in: ['PENDING', 'QUEUED', 'FAILED'] } },
    });
    for (const t of targets) await this.enqueueTarget(t.id, at, t.jobId);
  }

  async enqueueTarget(targetId: string, at: Date, previousJobId?: string | null) {
    if (previousJobId) await this.removeJob(previousJobId);
    const jobId = `${targetId}-${Date.now()}`;
    await this.prisma.postTarget.update({
      where: { id: targetId },
      data: { status: 'QUEUED', jobId, errorCode: null, errorMessage: null },
    });
    await this.queues.publish.add('publish', { targetId }, { jobId, delay: Math.max(0, at.getTime() - Date.now()) });
  }

  /** Planlanmış işleri kaldırır; hedefleri PENDING'e çeker (taslağa dönüş, silme). */
  async unschedulePost(postId: string) {
    const targets = await this.prisma.postTarget.findMany({ where: { postId, status: 'QUEUED' } });
    for (const t of targets) {
      if (t.jobId) await this.removeJob(t.jobId);
    }
    await this.prisma.postTarget.updateMany({
      where: { postId, status: 'QUEUED' },
      data: { status: 'PENDING', jobId: null },
    });
  }

  private async removeJob(jobId: string) {
    try {
      const job = await this.queues.publish.getJob(jobId);
      // Çalışmakta olan iş kaldırılamaz; worker jobId uyuşmazlığını görüp kendini atlar
      if (job && !(await job.isActive())) await job.remove();
    } catch {
      /* iş zaten yok */
    }
  }

  /** Hedeflerin durumuna göre gönderi durumunu günceller. */
  async refreshPostStatus(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { targets: true } });
    if (!post) return;
    const status = computePostStatus(
      post.status,
      post.targets.map((t) => t.status),
    );
    const publishedAt =
      status === 'PUBLISHED' || status === 'PARTIALLY_FAILED'
        ? post.targets
            .map((t) => t.publishedAt)
            .filter((d): d is Date => Boolean(d))
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
        : null;
    if (status !== post.status || publishedAt?.getTime() !== post.publishedAt?.getTime()) {
      await this.prisma.post.update({ where: { id: postId }, data: { status, publishedAt } });
    }
  }
}

export function computePostStatus(current: PostStatus, targets: TargetStatus[]): PostStatus {
  if (current === 'DRAFT' || current === 'PENDING_APPROVAL') {
    if (targets.every((t) => t === 'PENDING')) return current;
  }
  if (targets.length === 0) return current;
  if (targets.some((t) => t === 'PUBLISHING')) return 'PUBLISHING';
  if (targets.some((t) => t === 'QUEUED')) {
    return targets.some((t) => t === 'PUBLISHED' || t === 'FAILED') ? 'PUBLISHING' : 'SCHEDULED';
  }
  const published = targets.filter((t) => t === 'PUBLISHED').length;
  const failed = targets.filter((t) => t === 'FAILED').length;
  if (published === targets.length) return 'PUBLISHED';
  if (failed === targets.length) return 'FAILED';
  if (published > 0 && failed > 0 && published + failed === targets.length) return 'PARTIALLY_FAILED';
  return current;
}
