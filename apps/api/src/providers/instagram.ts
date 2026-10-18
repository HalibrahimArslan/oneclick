import type { AppConfig } from '../config';
import { httpRequest, ProviderError, sleep } from '../lib/http';
import { type ConnectedAccountInfo, type PublishInput, type PublishResult, type SocialProvider, type TokenSet } from './types';

/**
 * Instagram API with Facebook Login.
 * Instagram Professional hesabın bir Facebook Sayfasına bağlı olması gerekir.
 * Bağlantı: kullanıcı token'ı → uzun ömürlü token → Sayfalar → bağlı Instagram hesapları.
 * Akış: medya container oluştur → işlenmesini bekle → media_publish.
 */
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  // Sayfa bir Business portföyündeyse me/accounts onu ancak bu izinle döndürür
  'business_management',
];

export class InstagramProvider implements SocialProvider {
  readonly platform = 'INSTAGRAM' as const;
  private readonly graph: string;

  constructor(private readonly cfg: AppConfig) {
    this.graph = `https://graph.facebook.com/${cfg.INSTAGRAM_GRAPH_VERSION}`;
  }

  isConfigured() {
    return Boolean(this.cfg.INSTAGRAM_APP_ID && this.cfg.INSTAGRAM_APP_SECRET);
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL(`https://www.facebook.com/${this.cfg.INSTAGRAM_GRAPH_VERSION}/dialog/oauth`);
    u.searchParams.set('client_id', this.cfg.INSTAGRAM_APP_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccountInfo[]> {
    // 1) Kısa ömürlü kullanıcı token'ı
    const short = await httpRequest<any>(`${this.graph}/oauth/access_token`, {
      query: {
        client_id: this.cfg.INSTAGRAM_APP_ID!,
        client_secret: this.cfg.INSTAGRAM_APP_SECRET!,
        redirect_uri: redirectUri,
        code,
      },
    });

    // 2) Uzun ömürlü (60 gün) kullanıcı token'ı; bundan alınan Sayfa token'larının süresi dolmaz
    const long = await httpRequest<any>(`${this.graph}/oauth/access_token`, {
      query: {
        grant_type: 'fb_exchange_token',
        client_id: this.cfg.INSTAGRAM_APP_ID!,
        client_secret: this.cfg.INSTAGRAM_APP_SECRET!,
        fb_exchange_token: short.data.access_token,
      },
    });
    const userToken: string = long.data.access_token;

    const perms = await httpRequest<any>(`${this.graph}/me/permissions`, { query: { access_token: userToken } });
    const scopes: string[] = (perms.data?.data ?? [])
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission);

    // 3) Kullanıcının Sayfaları ve bunlara bağlı Instagram hesapları
    const pages = await httpRequest<any>(`${this.graph}/me/accounts`, {
      query: {
        fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
        limit: 100,
        access_token: userToken,
      },
    });

    const infos: ConnectedAccountInfo[] = [];
    for (const page of pages.data?.data ?? []) {
      const ig = page.instagram_business_account;
      if (!ig) continue;
      infos.push({
        accountType: 'IG_BUSINESS',
        externalId: String(ig.id),
        name: ig.name || ig.username,
        username: ig.username,
        avatarUrl: ig.profile_picture_url ?? null,
        metadata: { pageId: page.id, pageName: page.name },
        token: { accessToken: page.access_token, expiresAt: null, scopes },
      });
    }

    if (infos.length === 0) {
      throw new ProviderError(
        'Facebook Sayfalarınıza bağlı bir Instagram Professional hesabı bulunamadı. ' +
          'Instagram hesabını Sayfaya bağlayın ve izin ekranında Sayfayı seçin.',
        { retryable: false, code: 'ig_no_linked_account' },
      );
    }
    return infos;
  }

  /** Sayfa token'larının süresi dolmaz; yenileme gerekmez. */
  async refreshToken(): Promise<TokenSet | null> {
    return null;
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
