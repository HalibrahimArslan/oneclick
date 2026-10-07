export const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'MOCK'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ACCOUNT_TYPES = ['IG_BUSINESS', 'TIKTOK_CREATOR', 'LI_MEMBER', 'LI_ORGANIZATION', 'MOCK'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  MOCK: 'Test (Mock)',
};

export interface MediaInfo {
  mime: string;
  width?: number | null;
  height?: number | null;
  durationS?: number | null;
  sizeBytes?: number | null;
}

/**
 * Platform kuralları. Değerler platformların geliştirici dokümanlarına göre
 * belirlenmiştir; platformlar bunları değiştirebildiği için tek yerde tutulur.
 */
export const PLATFORM_RULES = {
  INSTAGRAM: {
    maxTextLength: 2200,
    maxHashtags: 30,
    mediaRequired: true,
    maxImages: 10,
    imageMimes: ['image/jpeg'],
    videoMimes: ['video/mp4', 'video/quicktime'],
    minVideoS: 3,
    maxVideoS: 900,
    maxImageBytes: 8 * 1024 * 1024,
  },
  TIKTOK: {
    maxTextLength: 2200,
    maxHashtags: Infinity,
    mediaRequired: true,
    maxImages: 35,
    imageMimes: ['image/jpeg', 'image/webp'],
    videoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    minVideoS: 3,
    maxVideoS: 600,
    maxImageBytes: 20 * 1024 * 1024,
  },
  LINKEDIN: {
    maxTextLength: 3000,
    maxHashtags: Infinity,
    mediaRequired: false,
    maxImages: 20,
    imageMimes: ['image/jpeg', 'image/png', 'image/gif'],
    videoMimes: ['video/mp4'],
    minVideoS: 3,
    maxVideoS: 1800,
    maxImageBytes: 36 * 1024 * 1024,
  },
  MOCK: {
    maxTextLength: 5000,
    maxHashtags: Infinity,
    mediaRequired: false,
    maxImages: 10,
    imageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    videoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    minVideoS: 0,
    maxVideoS: 3600,
    maxImageBytes: 50 * 1024 * 1024,
  },
} as const satisfies Record<Platform, unknown>;

export const TIKTOK_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

export const INSTAGRAM_POST_TYPES = ['FEED', 'REEL', 'STORY'] as const;
export type InstagramPostType = (typeof INSTAGRAM_POST_TYPES)[number];

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

const isVideo = (m: MediaInfo) => m.mime.startsWith('video/');
const isImage = (m: MediaInfo) => m.mime.startsWith('image/');

export function validateForPlatform(
  platform: Platform,
  input: { text: string; media: MediaInfo[]; options?: Record<string, unknown> | null },
): ValidationIssue[] {
  const rules = PLATFORM_RULES[platform];
  const issues: ValidationIssue[] = [];
  const text = input.text ?? '';
  const media = input.media ?? [];
  const options = input.options ?? {};

  if (text.length > rules.maxTextLength) {
    issues.push({
      level: 'error',
      code: 'text_too_long',
      message: `Metin ${rules.maxTextLength} karakteri geçemez (şu an ${text.length}).`,
    });
  }
  const hashtags = text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (hashtags > rules.maxHashtags) {
    issues.push({ level: 'error', code: 'too_many_hashtags', message: `En fazla ${rules.maxHashtags} hashtag kullanılabilir.` });
  }
  if (rules.mediaRequired && media.length === 0) {
    issues.push({ level: 'error', code: 'media_required', message: 'Bu platform en az bir görsel veya video ister.' });
  }
  if (!rules.mediaRequired && media.length === 0 && text.trim().length === 0) {
    issues.push({ level: 'error', code: 'empty_post', message: 'Gönderi boş olamaz.' });
  }

  const videos = media.filter(isVideo);
  const images = media.filter(isImage);

  if (videos.length > 1) {
    issues.push({ level: 'error', code: 'multiple_videos', message: 'Tek gönderide yalnızca bir video olabilir.' });
  }
  if (videos.length > 0 && images.length > 0 && platform !== 'INSTAGRAM' && platform !== 'MOCK') {
    issues.push({ level: 'error', code: 'mixed_media', message: 'Görsel ve video aynı gönderide birlikte kullanılamaz.' });
  }
  if (images.length > rules.maxImages) {
    issues.push({ level: 'error', code: 'too_many_images', message: `En fazla ${rules.maxImages} görsel eklenebilir.` });
  }
  for (const m of media) {
    const allowed: readonly string[] = isVideo(m) ? rules.videoMimes : rules.imageMimes;
    if (!allowed.includes(m.mime)) {
      issues.push({ level: 'error', code: 'unsupported_format', message: `${m.mime} biçimi bu platformda desteklenmiyor.` });
    }
    if (isVideo(m) && m.durationS != null) {
      if (m.durationS < rules.minVideoS || m.durationS > rules.maxVideoS) {
        issues.push({
          level: 'error',
          code: 'video_duration',
          message: `Video süresi ${rules.minVideoS}-${rules.maxVideoS} saniye arasında olmalı.`,
        });
      }
    }
    if (isImage(m) && m.sizeBytes != null && m.sizeBytes > rules.maxImageBytes) {
      issues.push({ level: 'error', code: 'image_too_large', message: 'Görsel dosya boyutu çok büyük.' });
    }
  }

  if (platform === 'INSTAGRAM') {
    const type = (options.postType as string) ?? 'FEED';
    if (type === 'REEL' && (videos.length !== 1 || images.length > 0)) {
      issues.push({ level: 'error', code: 'reel_needs_video', message: 'Reel için tam olarak bir video gerekir.' });
    }
    if (type === 'STORY' && media.length !== 1) {
      issues.push({ level: 'error', code: 'story_single_media', message: 'Story tek görsel veya video içerir.' });
    }
    if (type === 'FEED' && videos.length > 0 && media.length === 1) {
      issues.push({ level: 'warning', code: 'feed_video_as_reel', message: 'Instagram tek videoyu Reel olarak yayınlar.' });
    }
  }

  if (platform === 'TIKTOK') {
    if (!options.privacyLevel) {
      issues.push({ level: 'error', code: 'tiktok_privacy_required', message: 'TikTok için görünürlük seçmelisiniz.' });
    }
    if (options.musicConsent !== true) {
      issues.push({
        level: 'error',
        code: 'tiktok_music_consent',
        message: "TikTok Müzik Kullanım Onayı'nı kabul etmelisiniz.",
      });
    }
    if (options.brandContentToggle === true && options.privacyLevel === 'SELF_ONLY') {
      issues.push({
        level: 'error',
        code: 'tiktok_branded_private',
        message: 'Markalı içerik "Yalnızca ben" görünürlüğüyle paylaşılamaz.',
      });
    }
  }

  return issues;
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.level === 'error');
