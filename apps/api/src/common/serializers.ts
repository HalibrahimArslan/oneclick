import type { MediaAsset, Post, PostMedia, PostTarget, SocialAccount, User } from '@prisma/client';
import type { MediaAssetDto, PostDto, SocialAccountDto } from '@oneclick/shared';
import type { Storage } from '../core/storage';

export const toAccountDto = (a: SocialAccount): SocialAccountDto & { lastError: string | null } => ({
  id: a.id,
  platform: a.platform,
  accountType: a.accountType,
  name: a.name,
  username: a.username,
  avatarUrl: a.avatarUrl,
  status: a.status,
  brandId: a.brandId,
  createdAt: a.createdAt.toISOString(),
  lastError: a.lastError,
});

export const toMediaDto = (m: MediaAsset, storage: Storage): MediaAssetDto => ({
  id: m.id,
  fileName: m.fileName,
  mime: m.mime,
  url: storage.publicUrl(m.storageKey),
  width: m.width,
  height: m.height,
  durationS: m.durationS,
  sizeBytes: m.sizeBytes,
  status: m.status,
  createdAt: m.createdAt.toISOString(),
});

export type PostWithRelations = Post & {
  author: Pick<User, 'id' | 'name'>;
  media: (PostMedia & { media: MediaAsset })[];
  targets: (PostTarget & { account: SocialAccount })[];
};

export const POST_INCLUDE = {
  author: { select: { id: true, name: true } },
  media: { include: { media: true }, orderBy: { position: 'asc' as const } },
  targets: { include: { account: true }, orderBy: { createdAt: 'asc' as const } },
};

export const toPostDto = (p: PostWithRelations, storage: Storage): PostDto => ({
  id: p.id,
  brandId: p.brandId,
  text: p.text,
  status: p.status,
  scheduledAt: p.scheduledAt?.toISOString() ?? null,
  publishedAt: p.publishedAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
  author: p.author,
  media: p.media.map((pm) => toMediaDto(pm.media, storage)),
  targets: p.targets.map((t) => ({
    id: t.id,
    socialAccountId: t.socialAccountId,
    account: {
      id: t.account.id,
      platform: t.account.platform,
      name: t.account.name,
      username: t.account.username,
      avatarUrl: t.account.avatarUrl,
    },
    textOverride: t.textOverride,
    options: (t.options as Record<string, unknown>) ?? null,
    status: t.status,
    externalPostId: t.externalPostId,
    permalink: t.permalink,
    errorMessage: t.errorMessage,
    publishedAt: t.publishedAt?.toISOString() ?? null,
  })),
});
