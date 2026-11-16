import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  // API bir ters vekil (Caddy, nginx) arkasındaysa true
  TRUST_PROXY: bool,
  WEB_URL: z.string().url().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY 32 baytlık base64 olmalı (openssl rand -base64 32)'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  PUBLIC_MEDIA_BASE_URL: z.string().url().default('http://localhost:4000/media'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // MinIO gibi alt alan adı (bucket.host) desteklemeyen depolar için true: host/bucket/key
  S3_FORCE_PATH_STYLE: bool,

  ENABLE_MOCK_PROVIDER: bool,

  // Yeni kullanıcı kaydı açık mı. İlk kullanıcı (kurulum) her zaman kayıt olabilir.
  ALLOW_REGISTRATION: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
  // true: panelde uygulama bilgisi girmemiş çalışma alanları aşağıdaki .env anahtarlarını kullanır.
  // Kaydı herkese açık bir sunucuda false tutun; aksi halde herkes sizin uygulamanız üzerinden bağlanır.
  PLATFORM_APPS_FROM_ENV: bool,

  // Giriş ekranında "Demoyu dene": her ziyaretçiye örnek verili, geçici bir çalışma alanı açar.
  // Demo hesapları gerçek platformlara yayın yapmaz.
  DEMO_MODE: bool,
  DEMO_TTL_HOURS: z.coerce.number().min(1).max(24 * 7).default(24),

  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_GRAPH_VERSION: z.string().default('v23.0'),

  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_ORGANIZATIONS_ENABLED: bool,
  LINKEDIN_API_VERSION: z.string().default('202608'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  // .env dosyasını (varsa) yükle; Node 22+ yerleşik desteği
  try {
    process.loadEnvFile?.('.env');
  } catch {
    /* .env yoksa ortam değişkenleri kullanılır */
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ortam değişkenleri hatalı:\n${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export const oauthRedirectUri = (cfg: AppConfig, platform: string) =>
  `${cfg.API_PUBLIC_URL}/v1/oauth/callback/${platform.toLowerCase()}`;
