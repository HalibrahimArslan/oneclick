import type { AccountType, Platform } from '@oneclick/shared';
import type { AppConfig } from '../config';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes: string[];
}

export interface ConnectedAccountInfo {
  accountType: AccountType;
  externalId: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  token: TokenSet;
}

export interface PublishMedia {
  id: string;
  /** Platformun çekebileceği herkese açık adres */
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  sizeBytes: number;
  /** Dosyanın baytlarını okur (LinkedIn gibi yükleme isteyen platformlar için) */
  read(): Promise<Buffer>;
}

export interface PublishInput {
  account: {
    id: string;
    accountType: AccountType;
    externalId: string;
    metadata: Record<string, any> | null;
  };
  accessToken: string;
  text: string;
  media: PublishMedia[];
  options: Record<string, any>;
  /** Önceki denemeden kalan ara durum (container id, publish id vb.) */
  state: Record<string, any>;
  /** Ara durumu kalıcı olarak kaydeder; yeniden denemede çift paylaşımı önler */
  saveState(state: Record<string, any>): Promise<void>;
}

export interface PublishResult {
  externalPostId: string;
  permalink?: string | null;
  raw?: unknown;
}

export interface SocialProvider {
  readonly platform: Platform;
  /** .env içinde gerekli anahtarlar tanımlı mı */
  isConfigured(): boolean;
  getAuthUrl(params: { state: string; redirectUri: string }): string;
  exchangeCode(params: { code: string; redirectUri: string }): Promise<ConnectedAccountInfo[]>;
  /** Yenileme desteklenmiyorsa null döner */
  refreshToken(token: TokenSet): Promise<TokenSet | null>;
  publish(input: PublishInput): Promise<PublishResult>;
  /** Yayın öncesi platformdan dinamik bilgi (ör. TikTok creator_info) */
  getAccountCapabilities?(input: { accessToken: string; account: PublishInput['account'] }): Promise<Record<string, unknown>>;
}

export type ProviderFactory = (cfg: AppConfig) => SocialProvider;

export const secondsFromNow = (s?: number | null) => (s ? new Date(Date.now() + s * 1000) : null);
