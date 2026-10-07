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

  const maintenanceWorker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      if (job.name === 'token-refresh') return refreshExpiringTokens();
      if (job.name === 'sweeper') return sweepLostJobs();
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
