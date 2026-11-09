import type { AccountType, Platform, Prisma, PrismaClient, TargetStatus } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AppConfig } from '../config';
import { randomToken } from '../lib/crypto';
import type { CredentialService } from './credentials';
import type { SchedulerService } from './scheduler';
import { tmpUploadDir, type Storage } from './storage';

/** Demo görselleri (repo: apps/api/demo-assets) */
const ASSET_DIR = resolve(__dirname, '../../demo-assets');

/** Demo çalışma alanında dosya sınırları */
export const DEMO_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DEMO_MAX_FILES = 30;

/** Saatler İstanbul saatiyle (UTC+3) verilir; sunucu saat diliminden bağımsız. */
function at(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour - 3, minute, 0, 0);
  return d;
}

type AccountKey = 'kahveIg' | 'kahveTt' | 'novaIg' | 'novaLi' | 'me';
type MediaKey = 'kahve-1' | 'kahve-2' | 'nova-1' | 'nova-2';

const ACCOUNTS: Record<AccountKey, { platform: Platform; type: AccountType; name: string; username: string | null; brand: 'kahve' | 'nova' | null; metadata?: Record<string, unknown> }> = {
  kahveIg: { platform: 'INSTAGRAM', type: 'IG_BUSINESS', name: 'Kahve Durağı', username: 'kahveduragi', brand: 'kahve' },
  kahveTt: { platform: 'TIKTOK', type: 'TIKTOK_CREATOR', name: 'Kahve Durağı', username: null, brand: 'kahve' },
  novaIg: { platform: 'INSTAGRAM', type: 'IG_BUSINESS', name: 'Nova Yazılım', username: 'novayazilim', brand: 'nova' },
  novaLi: { platform: 'LINKEDIN', type: 'LI_ORGANIZATION', name: 'Nova Yazılım', username: 'nova-yazilim', brand: 'nova', metadata: { authorUrn: 'urn:li:organization:0' } },
  me: { platform: 'LINKEDIN', type: 'LI_MEMBER', name: 'Demo Kullanıcı', username: null, brand: null, metadata: { authorUrn: 'urn:li:person:demo' } },
};

interface SamplePost {
  brand: 'kahve' | 'nova' | null;
  text: string;
  media: MediaKey[];
  when: Date | null;
  kind: 'published' | 'scheduled' | 'draft';
  targets: { account: AccountKey; options?: Record<string, unknown>; failed?: string }[];
}

const TIKTOK_OPTS = { privacyLevel: 'PUBLIC_TO_EVERYONE', musicConsent: true, disableComment: false, disableDuet: false, disableStitch: false };

const samplePosts = (): SamplePost[] => [
  {
    brand: 'kahve',
    kind: 'published',
    when: at(-3, 10),
    text: 'Haftaya sıcak bir başlangıç ☕ Yeni sezon filtre kahvemiz bugünden itibaren tüm şubelerimizde.\n\n#kahve #yenisezon #kahvedurağı',
    media: ['kahve-1'],
    targets: [{ account: 'kahveIg', options: { postType: 'FEED' } }],
  },
  {
    brand: 'nova',
    kind: 'published',
    when: at(-2, 15, 30),
    text: 'Nova Yazılım ekibi büyüyor! 🚀 Backend ve mobil geliştirici pozisyonlarımız için başvurular açık. Detaylar profilimizdeki bağlantıda.\n\n#kariyer #yazılım #işilanı',
    media: ['nova-1'],
    targets: [
      { account: 'novaLi' },
      { account: 'novaIg', options: { postType: 'FEED' }, failed: 'Instagram 24 saatlik paylaşım kotası doldu' },
    ],
  },
  {
    brand: null,
    kind: 'published',
    when: at(-1, 9),
    text: 'Tek bir ekrandan üç platforma birden paylaşım yapmak düşündüğümden çok daha fazla zaman kazandırıyor. Ajans tarafında planlama artık takvim üzerinde sürükle-bırak kadar kolay.',
    media: [],
    targets: [{ account: 'me' }],
  },
  {
    brand: 'kahve',
    kind: 'scheduled',
    when: at(1, 9, 30),
    text: 'Sabahın ilk yudumu bizden 🌤️ Yarın 09.00–11.00 arası tüm filtre kahvelerde %20 indirim.\n\n#kahvekeyfi #günaydın',
    media: ['kahve-2'],
    targets: [{ account: 'kahveIg', options: { postType: 'FEED' } }, { account: 'kahveTt', options: TIKTOK_OPTS }],
  },
  {
    brand: 'nova',
    kind: 'scheduled',
    when: at(3, 11),
    text: 'Yeni sürüm yayında: Nova Panel 3.0 ile raporlar artık 2 kat daha hızlı. Neler değişti? Kısaca anlattık 👇\n\n#ürün #saas #yenisürüm',
    media: ['nova-2'],
    targets: [{ account: 'novaLi' }, { account: 'novaIg', options: { postType: 'FEED' } }],
  },
  {
    brand: 'kahve',
    kind: 'scheduled',
    when: at(5, 18),
    text: '',
    media: ['kahve-1'],
    targets: [{ account: 'kahveIg', options: { postType: 'STORY' } }],
  },
  {
    brand: null,
    kind: 'draft',
    when: null,
    text: 'Taslak: Sosyal medya planlamasında en çok yapılan 5 hata ve bunlardan nasıl kaçınılır…',
    media: [],
    targets: [{ account: 'me' }],
  },
];

/**
 * Tanıtım modu: her ziyaretçiye ayrı, örnek verili ve süreli bir çalışma alanı açar.
 * Demo hesapları metadata.demo=true taşır; yayın gerçek platforma değil Mock sağlayıcıya gider.
 */
export class DemoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: Storage,
    private readonly credentials: CredentialService,
    private readonly scheduler: SchedulerService,
    private readonly cfg: AppConfig,
  ) {}

  async create() {
    const expiresAt = new Date(Date.now() + this.cfg.DEMO_TTL_HOURS * 3600_000);
    const tag = randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '');

    const { user, workspaceId } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `demo-${tag}-${Date.now().toString(36)}@demo.oneclick.local`,
          name: 'Demo Kullanıcı',
          isDemo: true,
          // Giriş yalnızca demo oturumuyla; şifre kimseye verilmez
          passwordHash: await hash(randomToken(24)),
        },
      });
      const ws = await tx.workspace.create({
        data: { name: 'Demo Ajans', plan: 'demo', demoExpiresAt: expiresAt, members: { create: { userId: user.id, role: 'OWNER' } } },
      });
      return { user, workspaceId: ws.id };
    });

    await this.seed(workspaceId, user.id);
    return { user, workspaceId, expiresAt };
  }

  private async seed(workspaceId: string, userId: string) {
    const [kahve, nova] = await Promise.all([
      this.prisma.brand.create({ data: { workspaceId, name: 'Kahve Durağı' } }),
      this.prisma.brand.create({ data: { workspaceId, name: 'Nova Yazılım' } }),
    ]);
    const brandId = (b: 'kahve' | 'nova' | null) => (b === 'kahve' ? kahve.id : b === 'nova' ? nova.id : null);

    const accounts = {} as Record<AccountKey, string>;
    for (const [key, a] of Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][]) {
      const acc = await this.prisma.socialAccount.create({
        data: {
          workspaceId,
          brandId: brandId(a.brand),
          platform: a.platform,
          accountType: a.type,
          externalId: `demo-${key}-${randomUUID().slice(0, 8)}`,
          name: a.name,
          username: a.username,
          metadata: { ...(a.metadata ?? {}), demo: true } as Prisma.InputJsonValue,
          connectedById: userId,
        },
      });
      // Süresiz sahte token: yenileme işi bu hesaplara dokunmaz
      await this.credentials.save(acc.id, { accessToken: `demo-${randomUUID()}`, expiresAt: null, scopes: ['demo'] });
      accounts[key] = acc.id;
    }

    const media = {} as Record<MediaKey, string>;
    for (const name of ['kahve-1', 'kahve-2', 'nova-1', 'nova-2'] as MediaKey[]) {
      const id = randomUUID();
      const key = `${workspaceId}/${id}.jpg`;
      const src = join(ASSET_DIR, `${name}.jpg`);
      // putFile dosyayı taşır; kaynağı korumak için önce geçici kopya
      await mkdir(tmpUploadDir(), { recursive: true });
      const tmp = join(tmpUploadDir(), `${id}.jpg`);
      await copyFile(src, tmp);
      const { size } = await stat(tmp);
      await this.storage.putFile(tmp, key, 'image/jpeg');
      await this.prisma.mediaAsset.create({
        data: { id, workspaceId, uploadedById: userId, fileName: `${name}.jpg`, storageKey: key, mime: 'image/jpeg', sizeBytes: size, width: 1080, height: 1080, status: 'READY' },
      });
      media[name] = id;
    }

    for (const p of samplePosts()) {
      const targetStatus = (t: SamplePost['targets'][number]): TargetStatus =>
        p.kind === 'published' ? (t.failed ? 'FAILED' : 'PUBLISHED') : 'PENDING';
      const failed = p.targets.filter((t) => t.failed).length;
      const status =
        p.kind === 'draft' ? 'DRAFT' : p.kind === 'scheduled' ? 'SCHEDULED' : failed === 0 ? 'PUBLISHED' : failed === p.targets.length ? 'FAILED' : 'PARTIALLY_FAILED';

      const post = await this.prisma.post.create({
        data: {
          workspaceId,
          authorId: userId,
          brandId: brandId(p.brand),
          text: p.text,
          status,
          scheduledAt: p.when,
          publishedAt: p.kind === 'published' && failed < p.targets.length ? p.when : null,
          createdAt: p.when && p.kind === 'published' ? new Date(p.when.getTime() - 86400_000) : undefined,
          media: { create: p.media.map((m, position) => ({ mediaAssetId: media[m], position })) },
          targets: {
            create: p.targets.map((t) => ({
              socialAccountId: accounts[t.account],
              options: (t.options ?? {}) as Prisma.InputJsonValue,
              status: targetStatus(t),
              externalPostId: targetStatus(t) === 'PUBLISHED' ? `demo_${randomUUID().slice(0, 8)}` : null,
              publishedAt: targetStatus(t) === 'PUBLISHED' ? p.when : null,
              errorCode: t.failed ? 'ig_quota' : null,
              errorMessage: t.failed ?? null,
            })),
          },
        },
      });
      // Planlanmış örnekler gerçekten kuyruğa girer; zamanı gelince Mock'a "yayınlanır"
      if (p.kind === 'scheduled' && p.when) await this.scheduler.schedulePost(post.id, p.when);
    }
  }

  /** Süresi dolan demo çalışma alanlarını ve kullanıcılarını siler. */
  async cleanup() {
    const expired = await this.prisma.workspace.findMany({
      where: { demoExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 50,
    });
    for (const { id } of expired) {
      const posts = await this.prisma.post.findMany({ where: { workspaceId: id }, select: { id: true } });
      for (const p of posts) await this.scheduler.unschedulePost(p.id);
      const files = await this.prisma.mediaAsset.findMany({ where: { workspaceId: id }, select: { storageKey: true } });
      // PostMedia → MediaAsset RESTRICT olduğundan önce gönderiler silinir
      await this.prisma.post.deleteMany({ where: { workspaceId: id } });
      await this.prisma.workspace.delete({ where: { id } });
      await Promise.allSettled(files.map((f) => this.storage.remove(f.storageKey)));
    }
    const users = await this.prisma.user.deleteMany({ where: { isDemo: true, memberships: { none: {} } } });
    return { workspaces: expired.length, users: users.count };
  }
}
