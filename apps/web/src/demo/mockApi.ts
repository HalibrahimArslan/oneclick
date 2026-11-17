/**
 * Statik tanıtım sürümü (VITE_DEMO=true) için tarayıcı içi sahte API.
 *
 * Sunucu, veritabanı ya da kuyruk yoktur: tüm veri bu dosyadaki bellek içi durumda
 * tutulur ve localStorage'a yazılır. Davranış API'deki controller'ları ve demo
 * tohumunu (apps/api/src/core/demo.ts) taklit eder; yayınlar birkaç saniye sonra
 * "yayınlandı" olur, hiçbir şey gerçek platformlara gitmez.
 */
import {
  DEFAULT_APP_NAME,
  hasErrors,
  instagramOptionsSchema,
  reschedulePostSchema,
  tiktokOptionsSchema,
  upsertPostSchema,
  validateForPlatform,
  type AccountType,
  type BrandDto,
  type MediaAssetDto,
  type Platform,
  type PlatformAppDto,
  type PostDto,
  type PostStatus,
  type SocialAccountDto,
  type TargetStatus,
  type UpsertPostInput,
  type UserDto,
  type ValidationIssue,
  type WorkspaceDto,
} from '@oneclick/shared';
import kahve1 from '../../../api/demo-assets/kahve-1.jpg';
import kahve2 from '../../../api/demo-assets/kahve-2.jpg';
import nova1 from '../../../api/demo-assets/nova-1.jpg';
import nova2 from '../../../api/demo-assets/nova-2.jpg';
import { ApiError } from '../lib/api';

const STORE_KEY = 'oneclick.demo.v1';
const TTL_HOURS = 24;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 30;
/** Bu boyuta kadar görseller data URL olarak saklanır ve sayfa yenilenince de kalır */
const PERSIST_IMAGE_BYTES = 1.5 * 1024 * 1024;
/** Kuyruğa giren hedef bu kadar süre "yayınlanıyor" görünür */
const PUBLISHING_MS = 3000;

const SEED_IMAGES: Record<string, string> = { 'kahve-1': kahve1, 'kahve-2': kahve2, 'nova-1': nova1, 'nova-2': nova2 };

// ---------- durum ----------

type Account = SocialAccountDto & { lastError: string | null };
interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
  createdAt: string;
}
/** src: "seed:<ad>" (paketle gelen görsel), data: veya blob: adresi */
type Media = Omit<MediaAssetDto, 'url'> & { src: string };
interface Target {
  id: string;
  socialAccountId: string;
  textOverride: string | null;
  options: Record<string, unknown> | null;
  status: TargetStatus;
  externalPostId: string | null;
  permalink: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  /** Kuyruktaysa yayınlanacağı an */
  queuedAt: string | null;
}
interface Post {
  id: string;
  brandId: string | null;
  text: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  mediaIds: string[];
  targets: Target[];
}
interface State {
  user: UserDto;
  workspace: WorkspaceDto;
  brands: Brand[];
  accounts: Account[];
  media: Media[];
  posts: Post[];
}

let state: State | null = load();

function load(): State | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as State;
    if (!s.workspace?.demoExpiresAt || new Date(s.workspace.demoExpiresAt).getTime() < Date.now()) {
      localStorage.removeItem(STORE_KEY);
      return null;
    }
    // blob: adresleri sayfa yenilenince geçersizdir; o medyaları ve kullanımlarını düşür
    const lost = new Set(s.media.filter((m) => m.src.startsWith('blob:')).map((m) => m.id));
    if (lost.size) {
      s.media = s.media.filter((m) => !lost.has(m.id));
      for (const p of s.posts) p.mediaIds = p.mediaIds.filter((id) => !lost.has(id));
    }
    return s;
  } catch {
    return null;
  }
}

function save() {
  try {
    if (state) localStorage.setItem(STORE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* kota dolu veya depolama kapalı: bellekte devam */
  }
}

// ---------- yardımcılar ----------

const uuid = () => crypto.randomUUID();
const iso = (d: Date) => d.toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fail = (status: number, message: string, extra?: Record<string, unknown>): never => {
  throw new ApiError(message, status, { message, statusCode: status, ...extra });
};
const badRequest = (m: string, extra?: Record<string, unknown>) => fail(400, m, extra);
const notFound = (m = 'Bulunamadı') => fail(404, m);
const conflict = (m: string) => fail(409, m);

/** Paylaşılan zod şemalarıyla doğrular; web paketi zod'a doğrudan bağımlı olmasın diye yapısal tip */
type Schema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } };
function parse<T>(schema: Schema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) return badRequest(r.error.issues[0]?.message ?? 'Geçersiz istek');
  return r.data;
}

/** Saatler İstanbul saatiyle (UTC+3) verilir. */
function at(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour - 3, minute, 0, 0);
  return d;
}

const s = () => state ?? fail(401, 'Oturum bulunamadı');

// ---------- tohum ----------

type AccountKey = 'kahveIg' | 'kahveTt' | 'novaIg' | 'novaLi' | 'me';
type MediaKey = 'kahve-1' | 'kahve-2' | 'nova-1' | 'nova-2';

const ACCOUNTS: Record<AccountKey, { platform: Platform; type: AccountType; name: string; username: string | null; brand: 'kahve' | 'nova' | null }> = {
  kahveIg: { platform: 'INSTAGRAM', type: 'IG_BUSINESS', name: 'Kahve Durağı', username: 'kahveduragi', brand: 'kahve' },
  kahveTt: { platform: 'TIKTOK', type: 'TIKTOK_CREATOR', name: 'Kahve Durağı', username: null, brand: 'kahve' },
  novaIg: { platform: 'INSTAGRAM', type: 'IG_BUSINESS', name: 'Nova Yazılım', username: 'novayazilim', brand: 'nova' },
  novaLi: { platform: 'LINKEDIN', type: 'LI_ORGANIZATION', name: 'Nova Yazılım', username: 'nova-yazilim', brand: 'nova' },
  me: { platform: 'LINKEDIN', type: 'LI_MEMBER', name: 'Demo Kullanıcı', username: null, brand: null },
};

const TIKTOK_OPTS = { privacyLevel: 'PUBLIC_TO_EVERYONE', musicConsent: true, disableComment: false, disableDuet: false, disableStitch: false };

interface SamplePost {
  brand: 'kahve' | 'nova' | null;
  text: string;
  media: MediaKey[];
  when: Date | null;
  kind: 'published' | 'scheduled' | 'draft';
  targets: { account: AccountKey; options?: Record<string, unknown>; failed?: string }[];
}

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

function seed(): State {
  const now = new Date();
  const created = iso(new Date(now.getTime() - 7 * 864e5));
  const brands: Record<'kahve' | 'nova', Brand> = {
    kahve: { id: uuid(), name: 'Kahve Durağı', logoUrl: null, createdAt: created },
    nova: { id: uuid(), name: 'Nova Yazılım', logoUrl: null, createdAt: created },
  };
  const brandId = (b: 'kahve' | 'nova' | null) => (b ? brands[b].id : null);

  const accounts = {} as Record<AccountKey, Account>;
  for (const [key, a] of Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][]) {
    accounts[key] = {
      id: uuid(),
      platform: a.platform,
      accountType: a.type,
      name: a.name,
      username: a.username,
      avatarUrl: null,
      status: 'ACTIVE',
      brandId: brandId(a.brand),
      createdAt: created,
      lastError: null,
    };
  }

  const media = {} as Record<MediaKey, Media>;
  for (const name of Object.keys(SEED_IMAGES) as MediaKey[]) {
    media[name] = {
      id: uuid(),
      fileName: `${name}.jpg`,
      mime: 'image/jpeg',
      src: `seed:${name}`,
      width: 1080,
      height: 1080,
      durationS: null,
      sizeBytes: 58_000,
      status: 'READY',
      createdAt: created,
    };
  }

  const posts: Post[] = samplePosts().map((p) => {
    const when = p.when ? iso(p.when) : null;
    const targets: Target[] = p.targets.map((t) => {
      const status: TargetStatus = p.kind === 'published' ? (t.failed ? 'FAILED' : 'PUBLISHED') : p.kind === 'scheduled' ? 'QUEUED' : 'PENDING';
      return {
        id: uuid(),
        socialAccountId: accounts[t.account].id,
        textOverride: null,
        options: t.options ?? {},
        status,
        externalPostId: status === 'PUBLISHED' ? `demo_${uuid().slice(0, 8)}` : null,
        permalink: null,
        errorMessage: t.failed ?? null,
        publishedAt: status === 'PUBLISHED' ? when : null,
        queuedAt: status === 'QUEUED' ? when : null,
      };
    });
    const failed = p.targets.filter((t) => t.failed).length;
    return {
      id: uuid(),
      brandId: brandId(p.brand),
      text: p.text,
      status:
        p.kind === 'draft' ? 'DRAFT' : p.kind === 'scheduled' ? 'SCHEDULED' : failed === 0 ? 'PUBLISHED' : failed === p.targets.length ? 'FAILED' : 'PARTIALLY_FAILED',
      scheduledAt: when,
      publishedAt: p.kind === 'published' && failed < p.targets.length ? when : null,
      createdAt: p.when && p.kind === 'published' ? iso(new Date(p.when.getTime() - 864e5)) : iso(now),
      mediaIds: p.media.map((m) => media[m].id),
      targets,
    };
  });

  return {
    user: { id: uuid(), email: 'demo@oneclick.app', name: 'Demo Kullanıcı' },
    workspace: { id: uuid(), name: 'Demo Ajans', role: 'OWNER', demoExpiresAt: iso(new Date(now.getTime() + TTL_HOURS * 3600_000)) },
    brands: Object.values(brands),
    accounts: Object.values(accounts),
    media: Object.values(media),
    posts,
  };
}

// ---------- sahte yayın akışı ----------

/** API'deki refreshPostStatus'un karşılığı */
function postStatus(p: Post): PostStatus {
  if (p.status === 'DRAFT') return 'DRAFT';
  const st = p.targets.map((t) => t.status);
  if (st.some((x) => x === 'PUBLISHING')) return 'PUBLISHING';
  if (st.some((x) => x === 'QUEUED' || x === 'PENDING')) return 'SCHEDULED';
  if (st.every((x) => x === 'PUBLISHED')) return 'PUBLISHED';
  if (st.every((x) => x === 'FAILED')) return 'FAILED';
  return 'PARTIALLY_FAILED';
}

/** Worker'ın yerine: zamanı gelen hedefleri önce "yayınlanıyor", sonra "yayınlandı" yapar. */
function tick() {
  if (!state) return;
  const now = Date.now();
  let changed = false;
  for (const p of state.posts) {
    if (p.status === 'DRAFT') continue;
    for (const t of p.targets) {
      if ((t.status !== 'QUEUED' && t.status !== 'PUBLISHING') || !t.queuedAt) continue;
      const due = new Date(t.queuedAt).getTime();
      if (now < due) continue;
      if (now - due < PUBLISHING_MS) {
        if (t.status !== 'PUBLISHING') {
          t.status = 'PUBLISHING';
          changed = true;
        }
        continue;
      }
      t.status = 'PUBLISHED';
      t.queuedAt = null;
      t.errorMessage = null;
      t.externalPostId = `demo_${uuid().slice(0, 8)}`;
      t.publishedAt = iso(new Date(due + PUBLISHING_MS));
      changed = true;
    }
    const next = postStatus(p);
    if (next !== p.status) {
      p.status = next;
      changed = true;
    }
    if (!p.publishedAt && p.targets.some((t) => t.status === 'PUBLISHED')) {
      p.publishedAt = p.targets.find((t) => t.publishedAt)?.publishedAt ?? iso(new Date());
      changed = true;
    }
  }
  if (changed) save();
}

/** Bekleyen hedefleri verilen zamana kuyruğa alır. */
function enqueue(p: Post, when: string, include: TargetStatus[] = ['PENDING', 'QUEUED']) {
  for (const t of p.targets) {
    if (!include.includes(t.status)) continue;
    t.status = 'QUEUED';
    t.queuedAt = when;
    t.errorMessage = null;
  }
  p.status = postStatus(p);
}

// ---------- DTO'lar ----------

const mediaUrl = (m: Media) => (m.src.startsWith('seed:') ? SEED_IMAGES[m.src.slice(5)] : m.src);
const toMediaDto = ({ src, ...m }: Media): MediaAssetDto => ({ ...m, url: mediaUrl({ src, ...m }) });

function toPostDto(p: Post): PostDto {
  const st = s();
  return {
    id: p.id,
    brandId: p.brandId,
    text: p.text,
    status: p.status,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    author: { id: st.user.id, name: st.user.name },
    media: p.mediaIds.map((id) => st.media.find((m) => m.id === id)).filter((m): m is Media => Boolean(m)).map(toMediaDto),
    targets: p.targets.map(({ queuedAt: _q, ...t }) => {
      const a = st.accounts.find((x) => x.id === t.socialAccountId)!;
      return { ...t, account: { id: a.id, platform: a.platform, name: a.name, username: a.username, avatarUrl: a.avatarUrl } };
    }),
  };
}

// ---------- doğrulama (PostsController.check) ----------

const normalizeOptions = (platform: Platform, options: Record<string, unknown> | null | undefined) => {
  if (platform === 'INSTAGRAM') return instagramOptionsSchema.parse(options ?? {});
  if (platform === 'TIKTOK') return tiktokOptionsSchema.parse(options ?? {});
  return options ?? {};
};

function check(body: Pick<UpsertPostInput, 'text' | 'mediaIds' | 'targets'>) {
  const st = s();
  const ids = body.targets.map((t) => t.socialAccountId);
  if (new Set(ids).size !== ids.length) badRequest('Aynı hesap iki kez seçilmiş');
  const accounts = st.accounts.filter((a) => ids.includes(a.id) && a.status !== 'DISCONNECTED');
  if (accounts.length !== ids.length) badRequest('Seçilen hesaplardan biri bulunamadı');
  const media = body.mediaIds.map((id) => st.media.find((m) => m.id === id));
  if (media.some((m) => !m)) badRequest('Seçilen medyalardan biri bulunamadı');

  const targets = body.targets.map((t) => {
    const account = accounts.find((a) => a.id === t.socialAccountId)!;
    const options = normalizeOptions(account.platform, t.options);
    const issues: ValidationIssue[] = validateForPlatform(account.platform, {
      text: t.textOverride ?? body.text,
      media: media as Media[],
      options,
    });
    return { socialAccountId: t.socialAccountId, platform: account.platform, textOverride: t.textOverride ?? null, options, issues };
  });
  return { targets, hasErrors: targets.some((t) => hasErrors(t.issues)) };
}

function writePost(p: Post, body: UpsertPostInput) {
  const checked = check(body);
  if (body.mode !== 'draft' && checked.hasErrors) {
    badRequest('Gönderide düzeltilmesi gereken hatalar var', { targets: checked.targets });
  }
  const when = body.mode === 'now' ? iso(new Date()) : body.mode === 'schedule' ? iso(new Date(body.scheduledAt!)) : body.scheduledAt ? iso(new Date(body.scheduledAt)) : null;
  p.brandId = body.brandId ?? null;
  p.text = body.text;
  p.status = body.mode === 'draft' ? 'DRAFT' : 'SCHEDULED';
  p.scheduledAt = when;
  p.mediaIds = [...body.mediaIds];
  p.targets = checked.targets.map((t) => ({
    id: uuid(),
    socialAccountId: t.socialAccountId,
    textOverride: t.textOverride,
    options: t.options as Record<string, unknown>,
    status: 'PENDING',
    externalPostId: null,
    permalink: null,
    errorMessage: null,
    publishedAt: null,
    queuedAt: null,
  }));
  if (body.mode !== 'draft') enqueue(p, when!);
}

const LOCKED: PostStatus[] = ['PUBLISHING', 'PUBLISHED'];

function findPost(id: string) {
  return s().posts.find((p) => p.id === id) ?? notFound('Gönderi bulunamadı');
}

// ---------- uç noktalar ----------

type Handler = (m: RegExpMatchArray, body: any, query: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, fn: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), fn]);
const W = '/workspaces/:wid';

// Kimlik
route('GET', '/auth/config', () => ({
  registrationOpen: false,
  demoMode: true,
  demoTtlHours: TTL_HOURS,
  branding: { appName: DEFAULT_APP_NAME, color: null, logoUrl: null },
}));
route('POST', '/auth/demo', () => {
  state = seed();
  save();
  return { accessToken: 'demo', user: state.user };
});
route('POST', '/auth/login', () => fail(403, 'Bu tanıtım sürümünde giriş kapalı. "Demoyu dene" ile devam edin.'));
route('POST', '/auth/register', () => fail(403, 'Bu tanıtım sürümünde kayıt kapalı. "Demoyu dene" ile devam edin.'));
route('POST', '/auth/refresh', () => ({ accessToken: 'demo', user: s().user }));
route('POST', '/auth/logout', () => {
  state = null;
  save();
});
route('GET', '/auth/me', () => ({ user: s().user, workspaces: [s().workspace] }));

// Çalışma alanı
route('POST', '/workspaces', () => fail(403, 'Demo hesabında yeni çalışma alanı açılamaz.'));
route('PATCH', W, (_m, body) => {
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) badRequest('Ad en az 2 karakter olmalı');
  s().workspace.name = name;
  return { id: s().workspace.id, name };
});
route('GET', `${W}/members`, () => [{ ...s().user, role: 'OWNER' }]);
route('POST', `${W}/members`, () => fail(403, 'Demo hesabında üye eklenemez.'));
route('GET', `${W}/platforms`, () => (['INSTAGRAM', 'TIKTOK', 'LINKEDIN'] as Platform[]).map((platform) => ({ platform, configured: false })));
route('GET', `${W}/platform-apps`, (): PlatformAppDto[] =>
  (['INSTAGRAM', 'TIKTOK', 'LINKEDIN'] as Platform[]).map((platform) => ({
    platform,
    source: null,
    clientId: null,
    secretHint: null,
    options: {},
    redirectUri: `https://sizin-alan-adiniz.com/v1/oauth/callback/${platform.toLowerCase()}`,
    updatedAt: null,
  })),
);
route('PUT', `${W}/platform-apps/:p`, () => fail(403, 'Demo hesabında platform uygulaması eklenemez.'));
route('DELETE', `${W}/platform-apps/:p`, () => fail(403, 'Demo hesabında platform uygulaması eklenemez.'));

// Beyaz etiket: gerçek API'de de demo çalışma alanlarında kapalı
const BRANDING_DEMO = 'Demo hesabında marka değiştirilemez.';
route('GET', `${W}/branding`, () => fail(403, BRANDING_DEMO));
route('PUT', `${W}/branding`, () => fail(403, BRANDING_DEMO));
route('POST', `${W}/branding/logo`, () => fail(403, BRANDING_DEMO));
route('DELETE', `${W}/branding/logo`, () => fail(403, BRANDING_DEMO));

// Müşteriler
route('GET', `${W}/brands`, (): BrandDto[] =>
  [...s().brands]
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    .map((b) => ({ ...b, accountCount: s().accounts.filter((a) => a.brandId === b.id && a.status !== 'DISCONNECTED').length })),
);
route('POST', `${W}/brands`, (_m, body): BrandDto => {
  const name = String(body?.name ?? '').trim();
  if (name.length < 1) badRequest('Müşteri adı gerekli');
  const b: Brand = { id: uuid(), name, logoUrl: null, createdAt: iso(new Date()) };
  s().brands.push(b);
  return { ...b, accountCount: 0 };
});
route('PATCH', `${W}/brands/:id`, ([, , id], body) => {
  const b = s().brands.find((x) => x.id === id) ?? notFound('Müşteri bulunamadı');
  b.name = String(body?.name ?? b.name).trim();
  return { id, name: b.name };
});
route('DELETE', `${W}/brands/:id`, ([, , id]) => {
  const st = s();
  if (!st.brands.some((b) => b.id === id)) notFound('Müşteri bulunamadı');
  st.brands = st.brands.filter((b) => b.id !== id);
  for (const a of st.accounts) if (a.brandId === id) a.brandId = null;
  for (const p of st.posts) if (p.brandId === id) p.brandId = null;
});

// Hesaplar
route('GET', `${W}/accounts`, () =>
  s()
    .accounts.filter((a) => a.status !== 'DISCONNECTED')
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name, 'tr')),
);
route('GET', `${W}/accounts/connect/:p`, () => fail(403, 'Demo hesabında gerçek hesap bağlanamaz.'));
route('GET', `${W}/accounts/:id/capabilities`, ([, , id]) => {
  const a = s().accounts.find((x) => x.id === id) ?? notFound();
  return a.platform === 'TIKTOK'
    ? { creator_nickname: a.name, privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], max_video_post_duration_sec: 600 }
    : {};
});
route('PATCH', `${W}/accounts/:id`, ([, , id], body) => {
  const a = s().accounts.find((x) => x.id === id) ?? notFound();
  const brandId = body?.brandId ?? null;
  if (brandId && !s().brands.some((b) => b.id === brandId)) badRequest('Müşteri bulunamadı');
  a.brandId = brandId;
  return a;
});
route('DELETE', `${W}/accounts/:id`, ([, , id]) => {
  const a = s().accounts.find((x) => x.id === id) ?? notFound();
  a.status = 'DISCONNECTED';
});

// Medya
route('GET', `${W}/media`, () =>
  [...s().media].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toMediaDto),
);
route('DELETE', `${W}/media/:id`, ([, , id]) => {
  const st = s();
  const m = st.media.find((x) => x.id === id) ?? notFound();
  if (st.posts.some((p) => p.mediaIds.includes(id))) conflict('Bu medya bir gönderide kullanılıyor');
  if (m.src.startsWith('blob:')) URL.revokeObjectURL(m.src);
  st.media = st.media.filter((x) => x.id !== id);
});

// Gönderiler
route('GET', `${W}/posts`, (_m, _b, q) => {
  const from = q.get('from') ? new Date(q.get('from')!).getTime() : -Infinity;
  const to = q.get('to') ? new Date(q.get('to')!).getTime() : Infinity;
  const statuses = q.get('status')?.split(',');
  const brandId = q.get('brandId');
  return s()
    .posts.filter((p) => {
      if (statuses && !statuses.includes(p.status)) return false;
      if (brandId && p.brandId !== brandId) return false;
      const t = new Date(p.scheduledAt ?? p.publishedAt ?? p.createdAt).getTime();
      return t >= from && t < to;
    })
    .sort((a, b) => {
      // Postgres ASC: null'lar sonda; sonra en yeni oluşturulan önce
      if (a.scheduledAt !== b.scheduledAt) {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return a.scheduledAt.localeCompare(b.scheduledAt);
      }
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map(toPostDto);
});
route('POST', `${W}/posts/validate`, (_m, body) => check(parse(upsertPostSchema, { ...(body ?? {}), mode: 'draft' })));
route('GET', `${W}/posts/:id`, ([, , id]) => toPostDto(findPost(id)));
route('POST', `${W}/posts`, (_m, body) => {
  const input = parse(upsertPostSchema, body);
  const p: Post = {
    id: uuid(),
    brandId: null,
    text: '',
    status: 'DRAFT',
    scheduledAt: null,
    publishedAt: null,
    createdAt: iso(new Date()),
    mediaIds: [],
    targets: [],
  };
  writePost(p, input);
  s().posts.push(p);
  return toPostDto(p);
});
route('PUT', `${W}/posts/:id`, ([, , id], body) => {
  const p = findPost(id);
  if (LOCKED.includes(p.status)) conflict('Yayınlanan veya yayınlanmakta olan gönderi düzenlenemez');
  writePost(p, parse(upsertPostSchema, body));
  return toPostDto(p);
});
route('PATCH', `${W}/posts/:id/schedule`, ([, , id], body) => {
  const p = findPost(id);
  if (LOCKED.includes(p.status)) conflict('Bu gönderi artık taşınamaz');
  const { scheduledAt } = parse(reschedulePostSchema, body);
  const when = new Date(scheduledAt);
  if (when.getTime() < Date.now() - 60_000) badRequest('Geçmiş bir zamana taşınamaz');
  p.scheduledAt = iso(when);
  if (p.status !== 'DRAFT') enqueue(p, p.scheduledAt);
  return toPostDto(p);
});
route('POST', `${W}/posts/:id/publish-now`, ([, , id]) => {
  const p = findPost(id);
  if (LOCKED.includes(p.status)) conflict('Gönderi zaten yayında');
  const checked = check({ text: p.text, mediaIds: p.mediaIds, targets: p.targets });
  if (checked.hasErrors) badRequest('Gönderide hatalar var', { targets: checked.targets });
  p.scheduledAt = iso(new Date());
  p.status = 'SCHEDULED';
  enqueue(p, p.scheduledAt, ['PENDING', 'QUEUED', 'FAILED']);
  return toPostDto(p);
});
route('POST', `${W}/post-targets/:tid/retry`, ([, , tid]) => {
  const p = s().posts.find((x) => x.targets.some((t) => t.id === tid)) ?? notFound();
  const t = p.targets.find((x) => x.id === tid)!;
  if (t.status !== 'FAILED') conflict('Yalnızca başarısız hedefler yeniden denenebilir');
  t.status = 'QUEUED';
  t.queuedAt = iso(new Date());
  t.errorMessage = null;
  p.status = postStatus(p);
  return toPostDto(p);
});
route('DELETE', `${W}/posts/:id`, ([, , id]) => {
  const p = findPost(id);
  if (p.status === 'PUBLISHING') conflict('Yayınlanırken silinemez, birkaç saniye sonra tekrar deneyin');
  s().posts = s().posts.filter((x) => x !== p);
});

// ---------- dışa açılanlar ----------

/** Oturum var mı (refresh cookie'sinin yerine) */
export const hasSession = () => Boolean(state);

/** api() çağrılarını karşılar. Dönen değer API'nin JSON gövdesiyle aynıdır. */
export async function handle(method: string, fullPath: string, body?: unknown): Promise<unknown> {
  await sleep(120 + Math.random() * 180);
  const [path, qs] = fullPath.split('?');
  const query = new URLSearchParams(qs ?? '');
  tick();
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const match = path.match(re);
    if (!match) continue;
    if (!path.startsWith('/auth/') && !state) fail(401, 'Oturum bulunamadı');
    const result = fn(match, body, query);
    if (method !== 'GET') save();
    return result ?? undefined;
  }
  return notFound(`${method} ${path} demoda yok`);
}

/** Dosya yükleme: dosya tarayıcıda kalır, hiçbir yere gönderilmez. */
export async function upload(file: File, onProgress?: (pct: number) => void): Promise<MediaAssetDto> {
  const st = s();
  if (!/^(image|video)\//.test(file.type)) badRequest('Yalnızca görsel veya video yüklenebilir');
  if (file.size > MAX_FILE_BYTES) badRequest('Demo hesabında dosya en fazla 15 MB olabilir.');
  if (st.media.length >= MAX_FILES) badRequest(`Demo hesabında en fazla ${MAX_FILES} dosya yüklenebilir.`);

  for (const pct of [15, 40, 70, 100]) {
    await sleep(120);
    onProgress?.(pct);
  }

  const src = file.type.startsWith('image/') && file.size <= PERSIST_IMAGE_BYTES ? await readDataUrl(file) : URL.createObjectURL(file);
  const meta = await probe(file, src);
  const m: Media = {
    id: uuid(),
    fileName: file.name.slice(0, 255),
    mime: file.type,
    src,
    sizeBytes: file.size,
    status: 'READY',
    createdAt: iso(new Date()),
    ...meta,
  };
  st.media.push(m);
  save();
  return toMediaDto(m);
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

function probe(file: File, src: string): Promise<{ width: number | null; height: number | null; durationS: number | null }> {
  const empty = { width: null, height: null, durationS: null };
  return new Promise((resolve) => {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, durationS: null });
      img.onerror = () => resolve(empty);
      img.src = src;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve({ width: v.videoWidth || null, height: v.videoHeight || null, durationS: Number.isFinite(v.duration) ? v.duration : null });
      v.onerror = () => resolve(empty);
      v.src = src;
    }
  });
}
