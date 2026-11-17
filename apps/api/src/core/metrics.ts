import type { Prisma, PrismaClient } from '@prisma/client';
import { ProviderError } from '../lib/http';
import type { ProviderRegistry } from '../providers';
import type { CredentialService } from './credentials';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Bu yaştan eski gönderilerin istatistiği artık güncellenmez */
export const METRICS_WINDOW_MS = 30 * DAY;

/**
 * Yeni gönderiler sık, eskiler seyrek güncellenir: platform istek sınırlarını zorlamadan
 * etkileşimin en çok değiştiği ilk günleri yakalar.
 */
export function metricsDue(publishedAt: Date, metricsAt: Date | null, now = Date.now(), force = false) {
  if (!metricsAt) return true;
  const since = now - metricsAt.getTime();
  if (force) return since > 10 * 60_000;
  const age = now - publishedAt.getTime();
  return since > (age < 7 * DAY ? 6 * HOUR : DAY);
}

/** Yayınlanmış gönderilerin platform istatistiklerini (beğeni, yorum, erişim…) çeker ve saklar. */
export class MetricsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly providers: ProviderRegistry,
    private readonly credentials: CredentialService,
    private readonly log: (msg: string) => void = console.log,
  ) {}

  /**
   * Zamanı gelmiş hedefleri günceller. `workspaceId` verilirse yalnızca o çalışma alanı;
   * `force` ise (panelden "Yenile") son 10 dakikada güncellenmemiş her şey.
   */
  async refreshDue({ workspaceId, limit = 100, force = false }: { workspaceId?: string; limit?: number; force?: boolean } = {}) {
    const now = Date.now();
    const candidates = await this.prisma.postTarget.findMany({
      where: {
        status: 'PUBLISHED',
        externalPostId: { not: null },
        publishedAt: { gte: new Date(now - METRICS_WINDOW_MS) },
        // İstatistik verebilen hesaplar: Instagram ve demo (Mock) hesapları
        account: { status: 'ACTIVE', OR: [{ platform: 'INSTAGRAM' }, { metadata: { path: ['demo'], equals: true } }] },
        ...(workspaceId ? { post: { workspaceId } } : {}),
      },
      include: { account: { include: { credential: { select: { scopes: true } } } } },
      orderBy: { metricsAt: { sort: 'asc', nulls: 'first' } },
      take: limit * 3,
    });
    const due = candidates.filter((t) => metricsDue(t.publishedAt!, t.metricsAt, now, force)).slice(0, limit);

    let updated = 0;
    let failed = 0;
    for (const t of due) {
      const account = t.account;
      const isDemo = (account.metadata as Record<string, unknown> | null)?.demo === true;
      const provider = isDemo ? this.providers.MOCK : this.providers[account.platform];
      if (!provider.fetchMetrics) continue;
      try {
        const metrics = await provider.fetchMetrics({
          accessToken: await this.credentials.getAccessToken(account),
          scopes: account.credential?.scopes ?? [],
          externalPostId: t.externalPostId!,
          account: { id: account.id, accountType: account.accountType, externalId: account.externalId, metadata: (account.metadata as Record<string, any>) ?? null },
        });
        const capturedAt = new Date();
        await this.prisma.$transaction([
          this.prisma.postTarget.update({
            where: { id: t.id },
            data: { lastMetrics: { ...metrics, capturedAt: capturedAt.toISOString() } as Prisma.InputJsonValue, metricsAt: capturedAt },
          }),
          this.prisma.postMetric.create({ data: { postTargetId: t.id, capturedAt, metrics: metrics as Prisma.InputJsonValue } }),
        ]);
        updated++;
      } catch (err) {
        failed++;
        // Silinmiş gönderi, izin sorunu vb.: bir sonraki zamana kadar tekrar deneme (aynı hatayı her turda üretmesin)
        await this.prisma.postTarget.update({ where: { id: t.id }, data: { metricsAt: new Date() } });
        const detail = err instanceof ProviderError ? `${err.opts.status ?? ''} ${err.message}` : (err as Error).message;
        this.log(`istatistik alınamadı target=${t.id}: ${detail}`);
      }
    }
    return { checked: due.length, updated, failed };
  }
}
