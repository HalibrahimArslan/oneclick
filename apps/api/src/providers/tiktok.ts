import type { AppConfig } from '../config';
import { httpRequest, ProviderError, sleep } from '../lib/http';
import { secondsFromNow, type ConnectedAccountInfo, type PublishInput, type PublishResult, type SocialProvider, type TokenSet } from './types';

const API = 'https://open.tiktokapis.com/v2';

/**
 * TikTok Login Kit + Content Posting API (Direct Post).
 * NOT: Denetimden (audit) geçmemiş uygulamaların gönderileri yalnızca gizli (SELF_ONLY) yayınlanır.
 * Medya PULL_FROM_URL ile çekilir; medya alan adı TikTok geliştirici panelinde doğrulanmış olmalı.
 */
export class TikTokProvider implements SocialProvider {
  readonly platform = 'TIKTOK' as const;

  constructor(private readonly cfg: AppConfig) {}

  isConfigured() {
    return Boolean(this.cfg.TIKTOK_CLIENT_KEY && this.cfg.TIKTOK_CLIENT_SECRET);
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.searchParams.set('client_key', this.cfg.TIKTOK_CLIENT_KEY!);
    u.searchParams.set('scope', 'user.info.basic,video.publish');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    return u.toString();
  }

  private toTokenSet(d: any): TokenSet {
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? null,
      expiresAt: secondsFromNow(d.expires_in),
      refreshExpiresAt: secondsFromNow(d.refresh_expires_in),
      scopes: typeof d.scope === 'string' ? d.scope.split(',') : [],
    };
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccountInfo[]> {
    const res = await httpRequest<any>(`${API}/oauth/token/`, {
      method: 'POST',
      form: {
        client_key: this.cfg.TIKTOK_CLIENT_KEY!,
        client_secret: this.cfg.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      },
    });
    if (res.data.error) throw new ProviderError(res.data.error_description ?? res.data.error, { retryable: false });
    const token = this.toTokenSet(res.data);

    const info = await httpRequest<any>(`${API}/user/info/`, {
      query: { fields: 'open_id,union_id,avatar_url,display_name' },
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    const u = info.data.data?.user ?? {};
    return [
      {
        accountType: 'TIKTOK_CREATOR',
        externalId: res.data.open_id ?? u.open_id,
        name: u.display_name ?? 'TikTok hesabı',
        username: null,
        avatarUrl: u.avatar_url ?? null,
        token,
      },
    ];
  }

  async refreshToken(token: TokenSet): Promise<TokenSet | null> {
    if (!token.refreshToken) return null;
    const res = await httpRequest<any>(`${API}/oauth/token/`, {
      method: 'POST',
      form: {
        client_key: this.cfg.TIKTOK_CLIENT_KEY!,
        client_secret: this.cfg.TIKTOK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      },
    });
    if (res.data.error) {
      throw new ProviderError(res.data.error_description ?? res.data.error, { retryable: false, reauth: true });
    }
    return this.toTokenSet(res.data);
  }

  /** Composer'da gösterilmesi zorunlu: takma ad, izinli gizlilik seçenekleri, video süre sınırı. */
  async getAccountCapabilities({ accessToken }: { accessToken: string }) {
    const res = await this.call('/post/publish/creator_info/query/', accessToken, {});
    return res;
  }

  private async call(path: string, accessToken: string, json: unknown) {
    const res = await httpRequest<any>(`${API}${path}`, {
      method: 'POST',
      json,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const err = res.data?.error;
    if (err && err.code && err.code !== 'ok') {
      const retryable = ['rate_limit_exceeded', 'internal_error'].includes(err.code);
      const reauth = ['access_token_invalid', 'scope_not_authorized'].includes(err.code);
      throw new ProviderError(err.message || err.code, { retryable, reauth, code: `tiktok_${err.code}`, body: res.data });
    }
    return res.data.data ?? {};
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const at = input.accessToken;
    const o = input.options;
    const state = { ...input.state };

    if (!o.privacyLevel) {
      throw new ProviderError('TikTok görünürlük seçimi eksik', { retryable: false, code: 'tiktok_privacy_required' });
    }

    if (!state.publishId) {
      const creator = await this.call('/post/publish/creator_info/query/', at, {});
      const allowed: string[] = creator.privacy_level_options ?? [];
      if (allowed.length && !allowed.includes(o.privacyLevel)) {
        throw new ProviderError(
          `Bu hesap "${o.privacyLevel}" görünürlüğüne izin vermiyor. İzin verilenler: ${allowed.join(', ')}`,
          { retryable: false, code: 'tiktok_privacy_not_allowed' },
        );
      }

      const video = input.media.find((m) => m.mime.startsWith('video/'));
      const common = {
        privacy_level: o.privacyLevel,
        disable_comment: Boolean(o.disableComment),
        brand_content_toggle: Boolean(o.brandContentToggle),
        brand_organic_toggle: Boolean(o.brandOrganicToggle),
      };
      let data: any;
      if (video) {
        data = await this.call('/post/publish/video/init/', at, {
          post_info: {
            ...common,
            title: input.text.slice(0, 2200),
            disable_duet: Boolean(o.disableDuet),
            disable_stitch: Boolean(o.disableStitch),
          },
          source_info: { source: 'PULL_FROM_URL', video_url: video.url },
        });
      } else {
        const firstLine = input.text.split('\n')[0] ?? '';
        data = await this.call('/post/publish/content/init/', at, {
          post_info: { ...common, title: firstLine.slice(0, 90), description: input.text.slice(0, 4000), auto_add_music: true },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_cover_index: 0,
            photo_images: input.media.map((m) => m.url),
          },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO',
        });
      }
      state.publishId = data.publish_id;
      await input.saveState(state);
    }

    // Yayın durumunu bekle
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      const s = await this.call('/post/publish/status/fetch/', at, { publish_id: state.publishId });
      if (s.status === 'PUBLISH_COMPLETE') {
        const ids: string[] = s.publicaly_available_post_id ?? s.publicly_available_post_id ?? [];
        const postId = ids[0] ? String(ids[0]) : state.publishId;
        return {
          externalPostId: postId,
          // Gizli gönderilerin herkese açık bağlantısı olmaz
          permalink: ids[0] ? `https://www.tiktok.com/video/${ids[0]}` : null,
          raw: s,
        };
      }
      if (s.status === 'FAILED') {
        throw new ProviderError(`TikTok yayını başarısız: ${s.fail_reason ?? 'bilinmeyen neden'}`, {
          retryable: false,
          code: `tiktok_${s.fail_reason ?? 'failed'}`,
        });
      }
      await sleep(5000);
    }
    throw new ProviderError('TikTok yayını hâlâ işleniyor', { retryable: true, code: 'tiktok_processing' });
  }
}
