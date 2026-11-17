import { Worker } from 'bullmq';
import { createContainer } from './core/container';
import { MAINTENANCE_QUEUE, PUBLISH_QUEUE, type PublishJobData } from './core/queues';

/**
 * Worker süreci: zamanı gelen gönderileri yayınlar, token'ları yeniler,
 * kaçmış işleri yakalar. API'den ayrı çalışır ve yatayda çoğaltılabilir.
 */
async function main() {
  const c = createContainer();
  const log = (m: string) => console.log(`[worker] ${new Date().toISOString()} ${m}`);

  const publishWorker = new Worker<PublishJobData>(PUBLISH_QUEUE, (job) => c.publisher.process(job), {
    connection: c.redis,
    concurrency: 5,
  });
  publishWorker.on('error', (err) => log(`publish worker hatası: ${err.message}`));

  // Bakım işleri
  await c.queues.maintenance.upsertJobScheduler('token-refresh', { every: 60 * 60_000 }, { name: 'token-refresh' });
  await c.queues.maintenance.upsertJobScheduler('sweeper', { every: 60_000 }, { name: 'sweeper' });
  await c.queues.maintenance.upsertJobScheduler('demo-cleanup', { every: 15 * 60_000 }, { name: 'demo-cleanup' });
  await c.queues.maintenance.upsertJobScheduler('metrics', { every: 30 * 60_000 }, { name: 'metrics' });
  await c.queues.maintenance.upsertJobScheduler('inbox-sync', { every: 5 * 60_000 }, { name: 'inbox-sync' });

  const maintenanceWorker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      if (job.name === 'token-refresh') return refreshExpiringTokens();
      if (job.name === 'sweeper') return sweepLostJobs();
      if (job.name === 'inbox-sync') {
        const r = await c.inbox.syncAll();
        if (r.newMessages || r.failed) log(`gelen kutusu: ${r.newMessages} yeni yorum${r.failed ? `, ${r.failed} hesapta hata` : ''}`);
        return r;
      }
      if (job.name === 'metrics') {
        const r = await c.metrics.refreshDue();
        if (r.checked) log(`istatistik: ${r.updated}/${r.checked} güncellendi${r.failed ? `, ${r.failed} hata` : ''}`);
        return r;
      }
      if (job.name === 'demo-cleanup') {
        const r = await c.demo.cleanup();
        if (r.workspaces || r.users) log(`demo temizliği: ${r.workspaces} çalışma alanı, ${r.users} kullanıcı silindi`);
        return r;
      }
    },
    { connection: c.redis, concurrency: 1 },
  );
  maintenanceWorker.on('error', (err) => log(`bakım worker hatası: ${err.message}`));

  /** Süresi 3 gün içinde dolacak token'ları önceden yeniler. */
  async function refreshExpiringTokens() {
    const soon = new Date(Date.now() + 3 * 864e5);
    const creds = await c.prisma.oAuthCredential.findMany({
      where: { expiresAt: { lt: soon }, account: { status: 'ACTIVE' } },
      include: { account: true },
    });
    let ok = 0;
    for (const cred of creds) {
      try {
        await c.credentials.refresh(cred.account);
        ok++;
      } catch (err) {
        log(`token yenilenemedi account=${cred.socialAccountId}: ${(err as Error).message}`);
      }
    }
    if (creds.length) log(`token yenileme: ${ok}/${creds.length}`);
    return { checked: creds.length, refreshed: ok };
  }

  /** Redis'te işi kaybolmuş, zamanı geçmiş hedefleri yeniden kuyruğa alır. */
  async function sweepLostJobs() {
    const stale = await c.prisma.postTarget.findMany({
      where: {
        status: 'QUEUED',
        post: { scheduledAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      },
      take: 100,
    });
    let requeued = 0;
    for (const t of stale) {
      const job = t.jobId ? await c.queues.publish.getJob(t.jobId) : null;
      if (!job) {
        await c.scheduler.enqueueTarget(t.id, new Date());
        requeued++;
      }
    }
    if (requeued) log(`kaybolmuş ${requeued} iş yeniden kuyruğa alındı`);
    return { requeued };
  }

  log('çalışıyor');

  const shutdown = async () => {
    log('kapanıyor');
    await Promise.allSettled([publishWorker.close(), maintenanceWorker.close()]);
    await c.prisma.$disconnect();
    c.redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
