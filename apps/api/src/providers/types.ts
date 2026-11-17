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

/** Çalışma alanının platformdaki geliştirici uygulaması (panelden veya .env'den). */
export interface PlatformAppCredentials {
  clientId: string;
  clientSecret: string;
  options: { organizationsEnabled?: boolean };
}

export interface SocialProvider {
  readonly platform: Platform;
  getAuthUrl(params: { state: string; redirectUri: string; app: PlatformAppCredentials }): string;
  exchangeCode(params: { code: string; redirectUri: string; app: PlatformAppCredentials }): Promise<ConnectedAccountInfo[]>;
  /** Yenileme desteklenmiyorsa null döner */
  refreshToken(token: TokenSet, app: PlatformAppCredentials): Promise<TokenSet | null>;
  publish(input: PublishInput): Promise<PublishResult>;
  /** Yayın öncesi platformdan dinamik bilgi (ör. TikTok creator_info) */
  getAccountCapabilities?(input: { accessToken: string; account: PublishInput['account'] }): Promise<Record<string, unknown>>;
  /** Yayınlanmış gönderinin istatistiği. Platform izin vermiyorsa uygulanmaz. */
  fetchMetrics?(input: MetricsInput): Promise<PostMetrics>;

  // ---------- Gelen kutusu (yorumlar). Platform izin vermiyorsa uygulanmaz. ----------
  /** Hesabın `since` sonrasındaki gönderileri ve yorum sayıları */
  listRecentMedia?(input: { accessToken: string; account: PublishInput['account']; since: Date }): Promise<ProviderMedia[]>;
  /** Gönderideki üst düzey yorumlar ve yanıtları */
  listComments?(input: { accessToken: string; mediaId: string }): Promise<ProviderCommentThread[]>;
  /** Üst düzey yoruma yanıt yazar */
  replyToComment?(input: { accessToken: string; commentId: string; text: string }): Promise<{ id: string }>;
  setCommentHidden?(input: { accessToken: string; commentId: string; hidden: boolean }): Promise<void>;

  // ---------- Gelen kutusu (doğrudan mesajlar) ----------
  /** `since` sonrasında güncellenen konuşmalar ve son mesajları (yeniden eskiye) */
  listDirectThreads?(input: { accessToken: string; account: PublishInput['account'] & { username: string | null }; since: Date | null }): Promise<ProviderDirectThread[]>;
  /** Konuşmadaki kişiye mesaj gönderir (platformun yanıt süresi kurallarına tabidir) */
  sendDirectMessage?(input: { accessToken: string; account: PublishInput['account']; recipientId: string; text: string }): Promise<{ id: string }>;
}

export interface ProviderDirectMessage {
  id: string;
  text: string;
  timestamp: Date;
  fromId: string | null;
  fromUsername: string | null;
  /** Görsel adresleri; desteklenmeyen tür (hikâye yanıtı, paylaşım…) için yalnızca not */
  attachments: { type: 'image' | 'video' | 'other'; url: string | null }[];
}

export interface ProviderDirectThread {
  id: string;
  updatedAt: Date;
  /** Konuşmadaki karşı taraf */
  participant: { id: string; username: string | null };
  messages: ProviderDirectMessage[];
}

export interface ProviderMedia {
  id: string;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  commentsCount: number;
}

export interface ProviderComment {
  id: string;
  text: string;
  timestamp: Date;
  username: string | null;
  fromId: string | null;
  hidden: boolean;
}

export interface ProviderCommentThread {
  root: ProviderComment;
  replies: ProviderComment[];
}

export interface MetricsInput {
  accessToken: string;
  /** Token'ın izinleri: ek istatistikler (ör. erişim) yalnızca izin varsa istenir */
  scopes: string[];
  externalPostId: string;
  account: PublishInput['account'];
}

/** Platformun verdiği sayılar; vermediği alan yoktur (0 ile karıştırılmasın) */
export interface PostMetrics {
  likes?: number;
  comments?: number;
  reach?: number;
  views?: number;
  saved?: number;
  shares?: number;
}

export type ProviderFactory = (cfg: AppConfig) => SocialProvider;

export const secondsFromNow = (s?: number | null) => (s ? new Date(Date.now() + s * 1000) : null);
