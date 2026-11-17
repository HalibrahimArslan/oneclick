import { Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { reportQuerySchema, type InsightsLevel, type PostMetricsDto, type ReportDto } from '@oneclick/shared';
import type { z } from 'zod';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';
import { IG_INSIGHTS_SCOPE } from '../providers/instagram';

const MAX_ROWS = 5000;
const REFRESH_COOLDOWN_S = 5 * 60;

/**
 * Raporlar: seçilen dönemdeki her yayın (gönderi × hesap) ve son istatistiği.
 * Toplamlar, grafikler ve CSV tarayıcıda hesaplanır; böylece saat dilimi kullanıcınınkidir.
 */
@Controller('workspaces/:wid/reports')
export class ReportsController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get()
  async report(@Param('wid') wid: string, @Query(new ZodPipe(reportQuerySchema)) q: z.infer<typeof reportQuerySchema>): Promise<ReportDto> {
    const range = { gte: new Date(q.from), lt: new Date(q.to) };
    const targets = await this.c.prisma.postTarget.findMany({
      where: {
        post: { workspaceId: wid, ...(q.brandId ? { brandId: q.brandId } : {}) },
        OR: [
          { status: 'PUBLISHED', publishedAt: range },
          // Başarısız yayın: planlandığı zamana göre sayılır
          { status: 'FAILED', post: { scheduledAt: range } },
        ],
      },
      include: {
        account: { select: { id: true, name: true, username: true, avatarUrl: true, platform: true } },
        post: { select: { id: true, text: true, brandId: true, scheduledAt: true, author: { select: { id: true, name: true } } } },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: MAX_ROWS + 1,
    });

    const accounts = await this.c.prisma.socialAccount.findMany({
      where: { workspaceId: wid, status: { not: 'DISCONNECTED' } },
      select: { id: true, name: true, platform: true, metadata: true, credential: { select: { scopes: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      truncated: targets.length > MAX_ROWS,
      rows: targets.slice(0, MAX_ROWS).map((t) => ({
        targetId: t.id,
        postId: t.post.id,
        text: (t.textOverride ?? t.post.text).slice(0, 280),
        platform: t.account.platform,
        account: { id: t.account.id, name: t.account.name, username: t.account.username, avatarUrl: t.account.avatarUrl },
        brandId: t.post.brandId,
        author: t.post.author,
        status: t.status as 'PUBLISHED' | 'FAILED',
        at: (t.publishedAt ?? t.post.scheduledAt ?? t.createdAt).toISOString(),
        permalink: t.permalink,
        errorMessage: t.status === 'FAILED' ? t.errorMessage : null,
        metrics: (t.lastMetrics as PostMetricsDto | null) ?? null,
      })),
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, platform: a.platform, insights: insightsLevel(a) })),
    };
  }

  /** "İstatistikleri yenile": bu çalışma alanının güncel olmayan yayınlarını hemen çeker. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Param('wid') wid: string) {
    const key = `metrics:refresh:${wid}`;
    const ok = await this.c.redis.set(key, '1', 'EX', REFRESH_COOLDOWN_S, 'NX');
    if (!ok) {
      const ttl = await this.c.redis.ttl(key);
      throw new HttpException(`İstatistikler az önce yenilendi. ${Math.max(1, Math.ceil(ttl / 60))} dakika sonra tekrar deneyin.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.c.metrics.refreshDue({ workspaceId: wid, limit: 50, force: true });
  }
}

function insightsLevel(a: { platform: string; metadata: unknown; credential: { scopes: string[] } | null }): InsightsLevel {
  if ((a.metadata as Record<string, unknown> | null)?.demo === true) return 'full';
  if (a.platform !== 'INSTAGRAM') return 'unsupported';
  return a.credential?.scopes.includes(IG_INSIGHTS_SCOPE) ? 'full' : 'basic';
}
