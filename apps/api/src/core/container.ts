import { loadConfig, type AppConfig } from '../config';
import { TokenCipher } from '../lib/crypto';
import { getPrisma } from '../lib/prisma';
import { createProviders } from '../providers';
import { CredentialService } from './credentials';
import { BrandingService } from './branding';
import { DemoService } from './demo';
import { InboxService } from './inbox';
import { InviteService } from './invites';
import { MetricsService } from './metrics';
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
  const demo = new DemoService(prisma, storage, credentials, scheduler, cfg);
  const branding = new BrandingService(prisma, storage);
  const invites = new InviteService(prisma);
  const metrics = new MetricsService(prisma, providers, credentials);
  const inbox = new InboxService(prisma, providers, credentials, redis);
  return { cfg, prisma, redis, queues, cipher, providers, storage, platformApps, credentials, scheduler, publisher, demo, branding, invites, metrics, inbox };
}

export type Container = ReturnType<typeof createContainer>;
