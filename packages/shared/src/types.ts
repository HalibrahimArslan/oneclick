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
}
