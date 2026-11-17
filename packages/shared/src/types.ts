import type { AccountType, Platform } from './platforms';

export const POST_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'PARTIALLY_FAILED',
  'FAILED',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const TARGET_STATUSES = ['PENDING', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  role: Role;
  /** Doluysa geçici demo çalışma alanı; bu zamanda silinir */
  demoExpiresAt?: string | null;
  /** Açıksa Editörlerin gönderileri yayınlanmadan önce onaylanmalı */
  approvalRequired?: boolean;
}

export interface SocialAccountDto {
  id: string;
  platform: Platform;
  accountType: AccountType;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'NEEDS_REAUTH' | 'DISCONNECTED';
  brandId: string | null;
  createdAt: string;
}

export interface BrandDto {
  id: string;
  name: string;
  logoUrl: string | null;
  accountCount: number;
  createdAt: string;
}

export interface PlatformAppDto {
  platform: Platform;
  /** workspace: panelden kaydedildi · env: sunucu .env dosyasından · null: tanımsız */
  source: 'workspace' | 'env' | null;
  clientId: string | null;
  /** Secret'ın son 4 karakteri (yalnızca kontrol için) */
  secretHint: string | null;
  options: { organizationsEnabled?: boolean };
  /** Geliştirici uygulamasına girilmesi gereken OAuth yönlendirme adresi */
  redirectUri: string;
  updatedAt: string | null;
}

export interface MediaAssetDto {
  id: string;
  fileName: string;
  mime: string;
  url: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  sizeBytes: number;
  status: 'UPLOADING' | 'READY' | 'FAILED';
  createdAt: string;
}

export interface PostTargetDto {
  id: string;
  socialAccountId: string;
  account: Pick<SocialAccountDto, 'id' | 'platform' | 'name' | 'username' | 'avatarUrl'>;
  textOverride: string | null;
  options: Record<string, unknown> | null;
  status: TargetStatus;
  externalPostId: string | null;
  permalink: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
}

export interface PostDto {
  id: string;
  brandId: string | null;
  text: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  author: { id: string; name: string };
  media: MediaAssetDto[];
  targets: PostTargetDto[];
  /** Son onay isteği (yoksa null) */
  approval: ApprovalDto | null;
}

export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalDto {
  decision: ApprovalDecision;
  requestedBy: { id: string; name: string };
  requestedAt: string;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  /** Reddetme gerekçesi ya da onay notu */
  comment: string | null;
}

/** Beyaz etiket: tüm kurulum için geçerli marka. Giriş ekranı dahil her yerde kullanılır. */
export const DEFAULT_APP_NAME = 'OneClick';
export const DEFAULT_BRAND_COLOR = '#4b4fe0';

export interface BrandingDto {
  /** Her zaman dolu: özel ad yoksa DEFAULT_APP_NAME */
  appName: string;
  /** #rrggbb; null ise varsayılan indigo */
  color: string | null;
  /** Yüklenen logo (favicon olarak da kullanılır); null ise varsayılan logo */
  logoUrl: string | null;
}

// --- Ekip ve onay ---

/** Gönderiyi onaylayabilen roller. (ROLE_RANK sıralamasından bağımsız: Onaylayıcı, Editörün altında ama onaylayabilir.) */
export const APPROVER_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'APPROVER'];
export const canApprove = (role: Role | undefined) => Boolean(role && APPROVER_ROLES.includes(role));

/** Gönderiyi onaya göndermeden doğrudan planlayıp yayınlayabilir mi */
export const canPublishDirectly = (role: Role | undefined, approvalRequired: boolean | undefined) =>
  role === 'OWNER' || role === 'ADMIN' || (role === 'EDITOR' && !approvalRequired);

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  EDITOR: 'Editör',
  APPROVER: 'Onaylayıcı',
  VIEWER: 'İzleyici',
};

export interface MemberDto {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface InviteDto {
  id: string;
  role: Role;
  note: string | null;
  createdBy: { id: string; name: string };
  expiresAt: string;
  createdAt: string;
}

/** Davet oluşturulunca bir kez döner: token yalnızca bu yanıtta görünür */
export interface CreatedInviteDto extends InviteDto {
  token: string;
}

/** Davet linkini açan kişiye gösterilen bilgi (giriş gerektirmez) */
export interface InvitePreviewDto {
  workspaceName: string;
  role: Role;
  invitedBy: string;
}

// --- Raporlar ---

/** Platformdan çekilen gönderi istatistiği. Platform vermiyorsa alan yoktur (0 ile karıştırılmasın). */
export interface PostMetricsDto {
  likes?: number;
  comments?: number;
  /** Gönderiyi gören tekil hesap sayısı (Instagram: instagram_manage_insights izni gerekir) */
  reach?: number;
  views?: number;
  saved?: number;
  shares?: number;
  capturedAt: string;
}

/** Hesap için hangi istatistikler alınabiliyor */
export type InsightsLevel = 'full' | 'basic' | 'unsupported';

/** Rapordaki tek satır: bir gönderinin bir hesaptaki yayını (başarılı ya da başarısız) */
export interface ReportRowDto {
  targetId: string;
  postId: string;
  /** Gönderi metninin başı */
  text: string;
  platform: Platform;
  account: { id: string; name: string; username: string | null; avatarUrl: string | null };
  brandId: string | null;
  author: { id: string; name: string };
  status: 'PUBLISHED' | 'FAILED';
  /** Yayın zamanı; başarısızsa planlanan zaman */
  at: string;
  permalink: string | null;
  errorMessage: string | null;
  metrics: PostMetricsDto | null;
}

export interface ReportDto {
  rows: ReportRowDto[];
  /** Dönemde gösterilebilecekten fazla yayın varsa true (en yeniler döner) */
  truncated: boolean;
  /** Bağlı hesaplar ve istatistik düzeyi (rapor sayfasındaki açıklamalar için) */
  accounts: { id: string; name: string; platform: Platform; insights: InsightsLevel }[];
}

// --- Birleşik gelen kutusu (Instagram yorumları) ---

export type ConversationStatus = 'OPEN' | 'DONE';

export interface LabelDto {
  id: string;
  name: string;
}

export interface InboxMessageDto {
  id: string;
  direction: 'IN' | 'OUT';
  /** Platformdaki kullanıcı adı */
  authorName: string | null;
  body: string;
  hidden: boolean;
  sentAt: string;
  /** Panelden yanıt veren ekip üyesi */
  sentBy: { id: string; name: string } | null;
}

export interface ConversationDto {
  id: string;
  status: ConversationStatus;
  account: { id: string; name: string; username: string | null; avatarUrl: string | null; platform: Platform };
  /** Yorumun yazıldığı gönderi */
  context: { permalink: string | null; caption: string | null; thumbnailUrl: string | null } | null;
  lastMessageAt: string | null;
  /** Son mesaj (listede önizleme) */
  preview: Pick<InboxMessageDto, 'direction' | 'authorName' | 'body'> | null;
  messageCount: number;
  assignee: { id: string; name: string } | null;
  labels: LabelDto[];
}

export interface ConversationDetailDto extends ConversationDto {
  messages: InboxMessageDto[];
}

export interface InboxDto {
  conversations: ConversationDto[];
  counts: { open: number; mine: number; done: number };
  /** Yorum okuma izni olmayan Instagram hesapları (yeniden bağlanmalı) */
  needsReconnect: { id: string; name: string }[];
  /** Çalışma alanında yorumları okunabilen hesap var mı */
  hasSupportedAccounts: boolean;
}
