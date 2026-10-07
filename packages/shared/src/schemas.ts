import { z } from 'zod';
import { INSTAGRAM_POST_TYPES, TIKTOK_PRIVACY_LEVELS } from './platforms';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(80),
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(128),
  workspaceName: z.string().trim().min(2).max(80).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const instagramOptionsSchema = z.object({
  postType: z.enum(INSTAGRAM_POST_TYPES).default('FEED'),
});

export const tiktokOptionsSchema = z.object({
  privacyLevel: z.enum(TIKTOK_PRIVACY_LEVELS).optional(),
  disableComment: z.boolean().default(false),
  disableDuet: z.boolean().default(false),
  disableStitch: z.boolean().default(false),
  brandOrganicToggle: z.boolean().default(false),
  brandContentToggle: z.boolean().default(false),
  musicConsent: z.boolean().default(false),
});

export const postTargetInputSchema = z.object({
  socialAccountId: z.string().uuid(),
  textOverride: z.string().max(5000).nullish(),
  options: z.record(z.unknown()).nullish(),
});
export type PostTargetInput = z.infer<typeof postTargetInputSchema>;

export const POST_MODES = ['draft', 'schedule', 'now'] as const;

export const upsertPostSchema = z
  .object({
    brandId: z.string().uuid().nullish(),
    text: z.string().max(5000).default(''),
    mediaIds: z.array(z.string().uuid()).max(35).default([]),
    targets: z.array(postTargetInputSchema).min(1, 'En az bir hesap seçin'),
    mode: z.enum(POST_MODES),
    scheduledAt: z.string().datetime({ offset: true }).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'schedule') {
      if (!v.scheduledAt) {
        ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Planlama için tarih seçin' });
      } else if (new Date(v.scheduledAt).getTime() < Date.now() - 60_000) {
        ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Geçmiş bir zamana planlanamaz' });
      }
    }
  });
export type UpsertPostInput = z.infer<typeof upsertPostSchema>;

export const reschedulePostSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
});

export const listPostsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.string().optional(),
  brandId: z.string().uuid().optional(),
});

export const mediaUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mime: z.string().regex(/^(image|video)\//, 'Yalnızca görsel veya video yüklenebilir'),
  sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['ADMIN', 'EDITOR', 'APPROVER', 'VIEWER']),
});
