import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import { ProviderError, sleep } from '../lib/http';
import type { ConnectedAccountInfo, PublishInput, PublishResult, SocialProvider } from './types';

/**
 * Geliştirme için sahte platform. Gerçek API'ye gitmeden bağlama ve yayın akışını dener.
 * Metinde "#fail" geçerse kalıcı hata, "#flaky" geçerse ilk denemede geçici hata üretir.
 */
export class MockProvider implements SocialProvider {
  readonly platform = 'MOCK' as const;

  constructor(private readonly cfg: AppConfig) {}

  isConfigured() {
    return this.cfg.ENABLE_MOCK_PROVIDER;
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL(`${this.cfg.API_PUBLIC_URL}/v1/oauth/mock-authorize`);
    u.searchParams.set('state', state);
    u.searchParams.set('redirect_uri', redirectUri);
    return u.toString();
  }

  async exchangeCode({ code }: { code: string }): Promise<ConnectedAccountInfo[]> {
    const name = decodeURIComponent(code.split(':')[1] ?? 'Test Hesabı');
    return [
      {
        accountType: 'MOCK',
        externalId: `mock-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        username: name.toLowerCase().replace(/\s+/g, ''),
        avatarUrl: null,
        token: { accessToken: `mock-token-${randomUUID()}`, expiresAt: new Date(Date.now() + 30 * 864e5), scopes: ['publish'] },
      },
    ];
  }

  async refreshToken() {
    return { accessToken: `mock-token-${randomUUID()}`, expiresAt: new Date(Date.now() + 30 * 864e5), scopes: ['publish'] };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await sleep(800);
    if (input.text.includes('#fail')) {
      throw new ProviderError('Mock platform gönderiyi reddetti (#fail)', { retryable: false, code: 'mock_rejected' });
    }
    if (input.text.includes('#flaky') && !input.state.flakyOnce) {
      await input.saveState({ ...input.state, flakyOnce: true });
      throw new ProviderError('Mock platform geçici hata (#flaky)', { retryable: true, code: 'mock_flaky' });
    }
    const id = `mock_${randomUUID().slice(0, 8)}`;
    return { externalPostId: id, permalink: null };
  }
}
