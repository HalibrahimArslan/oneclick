import type { PlatformApp, PrismaClient } from '@prisma/client';
import { PLATFORMS, type Platform, type PlatformAppDto, type SavePlatformAppInput } from '@oneclick/shared';
import { oauthRedirectUri, type AppConfig } from '../config';
import type { TokenCipher } from '../lib/crypto';
import type { PlatformAppCredentials } from '../providers';

export interface ResolvedApp {
  app: PlatformAppCredentials;
  source: 'workspace' | 'env';
}

/** Gerçek platformlar (MOCK uygulama bilgisi istemez). */
export const REAL_PLATFORMS = PLATFORMS.filter((p) => p !== 'MOCK') as Exclude<Platform, 'MOCK'>[];

/**
 * Çalışma alanlarının platform uygulamaları (App ID + Secret).
 * Öncelik: panelden kaydedilen → (PLATFORM_APPS_FROM_ENV=true ise) .env.
 */
export class PlatformAppService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: TokenCipher,
    private readonly cfg: AppConfig,
  ) {}

  envApp(platform: Platform): PlatformAppCredentials | null {
    const c = this.cfg;
    const pick = (id?: string, secret?: string, options: PlatformAppCredentials['options'] = {}) =>
      id && secret ? { clientId: id, clientSecret: secret, options } : null;
    switch (platform) {
      case 'INSTAGRAM':
        return pick(c.INSTAGRAM_APP_ID, c.INSTAGRAM_APP_SECRET);
      case 'LINKEDIN':
        return pick(c.LINKEDIN_CLIENT_ID, c.LINKEDIN_CLIENT_SECRET, { organizationsEnabled: c.LINKEDIN_ORGANIZATIONS_ENABLED });
      case 'TIKTOK':
        return pick(c.TIKTOK_CLIENT_KEY, c.TIKTOK_CLIENT_SECRET);
      case 'MOCK':
        return null;
    }
  }

  private fromRow(row: PlatformApp): PlatformAppCredentials {
    return {
      clientId: row.clientId,
      clientSecret: this.cipher.decrypt(row.clientSecretEnc),
      options: (row.options as PlatformAppCredentials['options']) ?? {},
    };
  }

  async resolve(workspaceId: string, platform: Platform): Promise<ResolvedApp | null> {
    if (platform === 'MOCK') {
      return this.cfg.ENABLE_MOCK_PROVIDER ? { app: { clientId: 'mock', clientSecret: 'mock', options: {} }, source: 'env' } : null;
    }
    const row = await this.prisma.platformApp.findUnique({ where: { workspaceId_platform: { workspaceId, platform } } });
    if (row) return { app: this.fromRow(row), source: 'workspace' };
    if (this.cfg.PLATFORM_APPS_FROM_ENV) {
      const env = this.envApp(platform);
      if (env) return { app: env, source: 'env' };
    }
    return null;
  }

  /** Composer ve hesap ekranı için: hangi platformlar bağlanabilir */
  async configured(workspaceId: string) {
    const rows = await this.prisma.platformApp.findMany({ where: { workspaceId }, select: { platform: true } });
    const saved = new Set(rows.map((r) => r.platform));
    const list = REAL_PLATFORMS.map((platform) => ({
      platform: platform as Platform,
      configured: saved.has(platform) || (this.cfg.PLATFORM_APPS_FROM_ENV && Boolean(this.envApp(platform))),
    }));
    if (this.cfg.ENABLE_MOCK_PROVIDER) list.push({ platform: 'MOCK', configured: true });
    return list;
  }

  async list(workspaceId: string): Promise<PlatformAppDto[]> {
    const rows = await this.prisma.platformApp.findMany({ where: { workspaceId } });
    return REAL_PLATFORMS.map((platform) => {
      const redirectUri = oauthRedirectUri(this.cfg, platform);
      const row = rows.find((r) => r.platform === platform);
      if (row) {
        const secret = this.cipher.decrypt(row.clientSecretEnc);
        return {
          platform,
          source: 'workspace',
          clientId: row.clientId,
          secretHint: secret.slice(-4),
          options: (row.options as PlatformAppDto['options']) ?? {},
          redirectUri,
          updatedAt: row.updatedAt.toISOString(),
        };
      }
      const env = this.cfg.PLATFORM_APPS_FROM_ENV ? this.envApp(platform) : null;
      return {
        platform,
        source: env ? 'env' : null,
        // .env'deki bilgiler sunucu sahibine ait; başka çalışma alanlarına gösterilmez
        clientId: null,
        secretHint: null,
        options: {},
        redirectUri,
        updatedAt: null,
      };
    });
  }

  /** Kaydeder; secret boşsa mevcut secret korunur (yeni kayıtta zorunlu). */
  async save(workspaceId: string, platform: Platform, input: SavePlatformAppInput): Promise<'created' | 'updated'> {
    const existing = await this.prisma.platformApp.findUnique({ where: { workspaceId_platform: { workspaceId, platform } } });
    const secret = input.clientSecret?.trim();
    if (!existing && !secret) throw new Error('App Secret / Client Secret gerekli');
    const data = {
      clientId: input.clientId,
      ...(secret ? { clientSecretEnc: this.cipher.encrypt(secret) } : {}),
      options: input.options,
    };
    if (existing) {
      await this.prisma.platformApp.update({ where: { id: existing.id }, data });
      return 'updated';
    }
    await this.prisma.platformApp.create({
      data: { workspaceId, platform, clientId: input.clientId, clientSecretEnc: this.cipher.encrypt(secret!), options: input.options },
    });
    return 'created';
  }

  async remove(workspaceId: string, platform: Platform) {
    await this.prisma.platformApp.deleteMany({ where: { workspaceId, platform } });
  }
}
