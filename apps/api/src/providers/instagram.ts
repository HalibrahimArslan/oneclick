import type { AppConfig } from '../config';
import { httpRequest, ProviderError, sleep } from '../lib/http';
import { secondsFromNow, type ConnectedAccountInfo, type PublishInput, type PublishResult, type SocialProvider, type TokenSet } from './types';

/**
 * Instagram API with Instagram Login.
 * Facebook sayfası gerektirmez; yalnızca Business/Creator hesaplarda çalışır.
 * Akış: medya container oluştur → işlenmesini bekle → media_publish.
 */
export class InstagramProvider implements SocialProvider {
  readonly platform = 'INSTAGRAM' as const;
  private readonly graph: string;

  constructor(private readonly cfg: AppConfig) {
    this.graph = `https://graph.instagram.com/${cfg.INSTAGRAM_GRAPH_VERSION}`;
  }

  isConfigured() {
    return Boolean(this.cfg.INSTAGRAM_APP_ID && this.cfg.INSTAGRAM_APP_SECRET);
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.searchParams.set('client_id', this.cfg.INSTAGRAM_APP_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'instagram_business_basic,instagram_business_content_publish');
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccountInfo[]> {
    // 1) Kısa ömürlü token
    const short = await httpRequest<any>('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      form: {
        client_id: this.cfg.INSTAGRAM_APP_ID!,
        client_secret: this.cfg.INSTAGRAM_APP_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code.replace(/#_$/, ''),
      },
    });
    const shortData = Array.isArray(short.data?.data) ? short.data.data[0] : short.data;
    const shortToken: string = shortData.access_token;
    const permissions: string[] =
      typeof shortData.permissions === 'string' ? shortData.permissions.split(',') : shortData.permissions ?? [];

    // 2) Uzun ömürlü (60 gün) token
    const long = await httpRequest<any>('https://graph.instagram.com/access_token', {
      query: { grant_type: 'ig_exchange_token', client_secret: this.cfg.INSTAGRAM_APP_SECRET, access_token: shortToken },
    });

    const token: TokenSet = {
      accessToken: long.data.access_token,
      expiresAt: secondsFromNow(long.data.expires_in),
      scopes: permissions,
    };

    const me = await httpRequest<any>(`${this.graph}/me`, {
      query: { fields: 'user_id,username,name,profile_picture_url,account_type', access_token: token.accessToken },
    });

    return [
      {
        accountType: 'IG_BUSINESS',
        externalId: String(me.data.user_id ?? me.data.id),
        name: me.data.name || me.data.username,
        username: me.data.username,
        avatarUrl: me.data.profile_picture_url ?? null,
        metadata: { igAccountType: me.data.account_type },
        token,
      },
    ];
  }

  async refreshToken(token: TokenSet): Promise<TokenSet | null> {
    const res = await httpRequest<any>('https://graph.instagram.com/refresh_access_token', {
      query: { grant_type: 'ig_refresh_token', access_token: token.accessToken },
    });
    return { accessToken: res.data.access_token, expiresAt: secondsFromNow(res.data.expires_in), scopes: token.scopes };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const igId = input.account.externalId;
    const at = input.accessToken;
    const postType: 'FEED' | 'REEL' | 'STORY' = input.options.postType ?? 'FEED';
    const state = { ...input.state };

    // Daha önce yayınlandıysa (iş yeniden çalıştıysa) tekrar paylaşma
    if (state.mediaId) return this.finish(state.mediaId, at);

    if (!state.containerId) {
      state.containerId = await this.createContainer(igId, at, input, postType, state);
      await input.saveState(state);
    }

    await this.waitForContainer(state.containerId, at);

    await this.checkQuota(igId, at);

    const pub = await httpRequest<any>(`${this.graph}/${igId}/media_publish`, {
      method: 'POST',
      form: { creation_id: state.containerId, access_token: at },
    });
    state.mediaId = pub.data.id;
    await input.saveState(state);
    return this.finish(state.mediaId, at);
  }

  private async finish(mediaId: string, at: string): Promise<PublishResult> {
    let permalink: string | null = null;
    try {
      const m = await httpRequest<any>(`${this.graph}/${mediaId}`, { query: { fields: 'permalink', access_token: at } });
      permalink = m.data.permalink ?? null;
    } catch {
      /* permalink alınamazsa yayın yine başarılı */
    }
    return { externalPostId: mediaId, permalink };
  }

  private async createContainer(
    igId: string,
    at: string,
    input: PublishInput,
    postType: 'FEED' | 'REEL' | 'STORY',
    state: Record<string, any>,
  ): Promise<string> {
    const media = input.media;
    const isVideo = (m: { mime: string }) => m.mime.startsWith('video/');
    const create = async (form: Record<string, string>) => {
      const res = await httpRequest<any>(`${this.graph}/${igId}/media`, {
        method: 'POST',
        form: { ...form, access_token: at },
      });
      return res.data.id as string;
    };

    if (postType === 'STORY') {
      const m = media[0];
      return create(isVideo(m) ? { media_type: 'STORIES', video_url: m.url } : { media_type: 'STORIES', image_url: m.url });
    }

    if (media.length === 1) {
      const m = media[0];
      if (isVideo(m)) {
        return create({ media_type: 'REELS', video_url: m.url, caption: input.text, share_to_feed: 'true' });
      }
      return create({ image_url: m.url, caption: input.text });
    }

    // Carousel: önce her öğe için alt container
    const children: string[] = state.children ?? [];
    for (let i = children.length; i < media.length; i++) {
      const m = media[i];
      const id = await create(
        isVideo(m)
          ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: 'true' }
          : { image_url: m.url, is_carousel_item: 'true' },
      );
      children.push(id);
      state.children = children;
      await input.saveState(state);
    }
    for (const c of children) await this.waitForContainer(c, at);
    return create({ media_type: 'CAROUSEL', children: children.join(','), caption: input.text });
  }

  /** Container FINISHED olana kadar bekler (en fazla ~5 dk; sonra iş yeniden denenir). */
  private async waitForContainer(containerId: string, at: string) {
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      const res = await httpRequest<any>(`${this.graph}/${containerId}`, {
        query: { fields: 'status_code,status', access_token: at },
      });
      const code = res.data.status_code as string;
      if (code === 'FINISHED' || code === 'PUBLISHED') return;
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new ProviderError(`Instagram medyayı işleyemedi: ${res.data.status ?? code}`, {
          retryable: false,
          code: `ig_container_${code.toLowerCase()}`,
        });
      }
      await sleep(5000);
    }
    throw new ProviderError('Instagram medya işleme hâlâ sürüyor', { retryable: true, code: 'ig_processing' });
  }

  private async checkQuota(igId: string, at: string) {
    try {
      const res = await httpRequest<any>(`${this.graph}/${igId}/content_publishing_limit`, {
        query: { fields: 'quota_usage,config', access_token: at },
      });
      const d = res.data?.data?.[0];
      if (d && d.config?.quota_total != null && d.quota_usage >= d.config.quota_total) {
        throw new ProviderError('Instagram 24 saatlik paylaşım kotası doldu', { retryable: true, code: 'ig_quota' });
      }
    } catch (err) {
      if (err instanceof ProviderError && err.opts.code === 'ig_quota') throw err;
      /* kota sorgusu başarısızsa yayına devam et */
    }
  }
}
