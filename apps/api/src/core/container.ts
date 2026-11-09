import { loadConfig, type AppConfig } from '../config';
import { TokenCipher } from '../lib/crypto';
import { getPrisma } from '../lib/prisma';
import { createProviders } from '../providers';
import { CredentialService } from './credentials';
import { PlatformAppService } from './platform-apps';
import { PublishProcessor } from './publisher';
import { createQueues, createRedis } from './queues';
import { SchedulerService } from './scheduler';
import { createStorage } from './storage';

/** API ve worker'ın paylaştığı servisler. Nest'e bağımlı değildir. */
export function createContainer(cfg: AppConfig = loadConfig()) {
  const prisma = getPrisma();
  const redis = createRedis(cfg);
  const queues = createQueues(redis);
  const cipher = new TokenCipher(cfg.ENCRYPTION_KEY);
  const providers = createProviders(cfg);
  const storage = createStorage(cfg);
  const platformApps = new PlatformAppService(prisma, cipher, cfg);
  const credentials = new CredentialService(prisma, cipher, providers, platformApps);
  const scheduler = new SchedulerService(prisma, queues);
  const publisher = new PublishProcessor(prisma, providers, credentials, storage, scheduler);
  return { cfg, prisma, redis, queues, cipher, providers, storage, platformApps, credentials, scheduler, publisher };
}

export type Container = ReturnType<typeof createContainer>;
