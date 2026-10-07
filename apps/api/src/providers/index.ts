import type { Platform } from '@oneclick/shared';
import type { AppConfig } from '../config';
import { InstagramProvider } from './instagram';
import { LinkedInProvider } from './linkedin';
import { MockProvider } from './mock';
import { TikTokProvider } from './tiktok';
import type { SocialProvider } from './types';

export type ProviderRegistry = Record<Platform, SocialProvider>;

export function createProviders(cfg: AppConfig): ProviderRegistry {
  return {
    INSTAGRAM: new InstagramProvider(cfg),
    TIKTOK: new TikTokProvider(cfg),
    LINKEDIN: new LinkedInProvider(cfg),
    MOCK: new MockProvider(cfg),
  };
}

export * from './types';
