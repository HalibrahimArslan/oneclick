import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { AppConfig } from '../config';

export const PUBLISH_QUEUE = 'publish';
export const MAINTENANCE_QUEUE = 'maintenance';

export interface PublishJobData {
  targetId: string;
}

export const PUBLISH_ATTEMPTS = 4;

export function createRedis(cfg: AppConfig) {
  // BullMQ worker'ları için maxRetriesPerRequest null olmalı
  return new IORedis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
}

export function createQueues(connection: IORedis) {
  const publish = new Queue<PublishJobData>(PUBLISH_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: PUBLISH_ATTEMPTS,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  const maintenance = new Queue(MAINTENANCE_QUEUE, { connection });
  return { publish, maintenance };
}

export type Queues = ReturnType<typeof createQueues>;
