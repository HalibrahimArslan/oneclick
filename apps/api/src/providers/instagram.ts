import type { AppConfig } from '../config';
import { httpRequest, ProviderError, sleep } from '../lib/http';
import {
  type ConnectedAccountInfo,
  type MetricsInput,
  type PlatformAppCredentials,
  type PostMetrics,
  type ProviderComment,
  type ProviderCommentThread,
  type ProviderDirectMessage,
  type ProviderDirectThread,
  type ProviderMedia,
  type PublishInput,
  type PublishResult,
  type SocialProvider,
  type TokenSet,
} from './types';

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
  // Raporlar: erişim, görüntülenme, kaydetme, paylaşım (beğeni ve yorum instagram_basic ile okunur)
  'instagram_manage_insights',
  // Gelen kutusu: yorumları okuma, yanıtlama, gizleme
  'instagram_manage_comments',
  // Gelen kutusu: doğrudan mesajlar (Instagram'da "Mesajlara erişime izin ver" açık olmalı)
  'instagram_manage_messages',
];

export const IG_COMMENTS_SCOPE = 'instagram_manage_comments';
export const IG_MESSAGES_SCOPE = 'instagram_manage_messages';
/** Meta: kişinin son mesajından sonra yanıt verilebilen süre (standart mesajlaşma penceresi) */
export const IG_REPLY_WINDOW_MS = 24 * 3600_000;

export const IG_INSIGHTS_SCOPE = 'instagram_manage_insights';

export class InstagramProvider implements SocialProvider {
  readonly platform = 'INSTAGRAM' as const;
  private readonly graph: string;

  constructor(private readonly cfg: AppConfig) {
    this.graph = `https://graph.facebook.com/${cfg.INSTAGRAM_GRAPH_VERSION}`;
  }

  getAuthUrl({ state, redirectUri, app }: { state: string; redirectUri: string; app: PlatformAppCredentials }) {
    const u = new URL(`https://www.facebook.com/${this.cfg.INSTAGRAM_GRAPH_VERSION}/dialog/oauth`);
    u.searchParams.set('client_id', app.clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCode({ code, redirectUri, app }: { code: string; redirectUri: string; app: PlatformAppCredentials }): Promise<ConnectedAccountInfo[]> {
    // 1) Kısa ömürlü kullanıcı token'ı
    const short = await httpRequest<any>(`${this.graph}/oauth/access_token`, {
      query: {
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    // 2) Uzun ömürlü (60 gün) kullanıcı token'ı; bundan alınan Sayfa token'larının süresi dolmaz
    const long = await httpRequest<any>(`${this.graph}/oauth/access_token`, {
      query: {
        grant_type: 'fb_exchange_token',
        client_id: app.clientId,
        client_secret: app.clientSecret,
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

  async fetchMetrics({ accessToken, scopes, externalPostId }: MetricsInput): Promise<PostMetrics> {
    const media = await httpRequest<any>(`${this.graph}/${externalPostId}`, {
      query: { fields: 'like_count,comments_count,media_product_type', access_token: accessToken },
    });
    const out: PostMetrics = {};
    // Hesap beğeni sayısını gizlemişse like_count gelmez
    if (typeof media.data.like_count === 'number') out.likes = media.data.like_count;
    if (typeof media.data.comments_count === 'number') out.comments = media.data.comments_count;
    if (!scopes.includes(IG_INSIGHTS_SCOPE)) return out;

    // Her medya türü her metriği desteklemez (ör. hikâye); önce tam liste, olmazsa yalnızca erişim
    for (const metric of ['reach,views,saved,shares', 'reach']) {
      try {
        const ins = await httpRequest<any>(`${this.graph}/${externalPostId}/insights`, { query: { metric, access_token: accessToken } });
        for (const m of ins.data?.data ?? []) {
          const v = m.values?.[0]?.value ?? m.total_value?.value;
          if (typeof v === 'number' && ['reach', 'views', 'saved', 'shares'].includes(m.name)) out[m.name as 'reach'] = v;
        }
        break;
      } catch (err) {
        if (err instanceof ProviderError && err.opts.reauth) throw err;
      }
    }
    return out;
  }

  // ---------- Gelen kutusu ----------

  async listRecentMedia({ accessToken, account, since }: { accessToken: string; account: PublishInput['account']; since: Date }): Promise<ProviderMedia[]> {
    const res = await httpRequest<any>(`${this.graph}/${account.externalId}/media`, {
      query: { fields: 'id,caption,permalink,media_type,media_url,thumbnail_url,timestamp,comments_count', limit: 50, access_token: accessToken },
    });
    return (res.data?.data ?? [])
      .filter((m: any) => new Date(m.timestamp) >= since)
      .map((m: any) => ({
        id: String(m.id),
        permalink: m.permalink ?? null,
        caption: m.caption ?? null,
        // Videoda media_url video dosyasıdır; küçük resim thumbnail_url'de
        thumbnailUrl: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? null,
        commentsCount: m.comments_count ?? 0,
      }));
  }

  async listComments({ accessToken, mediaId }: { accessToken: string; mediaId: string }): Promise<ProviderCommentThread[]> {
    const fields = 'id,text,timestamp,username,hidden,from{id,username}';
    const toComment = (c: any): ProviderComment => ({
      id: String(c.id),
      text: c.text ?? '',
      timestamp: new Date(c.timestamp),
      username: c.username ?? c.from?.username ?? null,
      fromId: c.from?.id ? String(c.from.id) : null,
      hidden: Boolean(c.hidden),
    });
    const threads: ProviderCommentThread[] = [];
    let url: string | null = `${this.graph}/${mediaId}/comments`;
    let query: Record<string, string | number> | undefined = { fields: `${fields},replies{${fields}}`, limit: 50, access_token: accessToken };
    // Çok yorumlu gönderide en fazla 5 sayfa (250 üst düzey yorum)
    for (let page = 0; url && page < 5; page++) {
      const res: { data: any } = await httpRequest<any>(url, { query });
      for (const c of res.data?.data ?? []) {
        threads.push({ root: toComment(c), replies: (c.replies?.data ?? []).map(toComment) });
      }
      url = res.data?.paging?.next ?? null;
      query = undefined; // next adresi tüm parametreleri içerir
    }
    return threads;
  }

  async replyToComment({ accessToken, commentId, text }: { accessToken: string; commentId: string; text: string }) {
    const res = await httpRequest<any>(`${this.graph}/${commentId}/replies`, { method: 'POST', form: { message: text, access_token: accessToken } });
    return { id: String(res.data.id) };
  }

  async setCommentHidden({ accessToken, commentId, hidden }: { accessToken: string; commentId: string; hidden: boolean }) {
    await httpRequest<any>(`${this.graph}/${commentId}`, { method: 'POST', form: { hide: String(hidden), access_token: accessToken } });
  }

  // ---------- Doğrudan mesajlar (Messenger Platform, Sayfa token'ı ile) ----------

  private pageIdOf(account: PublishInput['account']) {
    const pageId = account.metadata?.pageId;
    if (!pageId) throw new ProviderError('Hesabın bağlı olduğu Facebook Sayfası bilinmiyor; hesabı yeniden bağlayın.', { retryable: false, reauth: true });
    return String(pageId);
  }

  async listDirectThreads({
    accessToken,
    account,
    since,
  }: {
    accessToken: string;
    account: PublishInput['account'] & { username: string | null };
    since: Date | null;
  }): Promise<ProviderDirectThread[]> {
    const own = (p: { id?: string; username?: string }) =>
      String(p.id) === account.externalId || (Boolean(p.username) && p.username!.toLowerCase() === account.username?.toLowerCase());
    const toMessage = (m: any): ProviderDirectMessage => ({
      id: String(m.id),
      text: m.message ?? '',
      timestamp: new Date(m.created_time),
      fromId: m.from?.id ? String(m.from.id) : null,
      fromUsername: m.from?.username ?? null,
      attachments: (m.attachments?.data ?? []).map((a: any) =>
        a.image_data ? { type: 'image', url: a.image_data.url ?? null } : a.video_data ? { type: 'video', url: a.video_data.url ?? null } : { type: 'other', url: a.file_url ?? null },
      ),
    });

    const threads: ProviderDirectThread[] = [];
    let url: string | null = `${this.graph}/${this.pageIdOf(account)}/conversations`;
    let query: Record<string, string | number> | undefined = {
      platform: 'instagram',
      fields: 'id,updated_time,participants,messages.limit(20){id,created_time,from,message,attachments}',
      limit: 25,
      access_token: accessToken,
    };
    // Konuşmalar yeniden eskiye gelir; son eşitlemeden eskisine varınca dur (en fazla 4 sayfa)
    outer: for (let page = 0; url && page < 4; page++) {
      const res: { data: any } = await httpRequest<any>(url, { query });
      for (const c of res.data?.data ?? []) {
        const updatedAt = new Date(c.updated_time);
        if (since && updatedAt <= since) break outer;
        const other = (c.participants?.data ?? []).find((p: any) => !own(p));
        if (!other) continue;
        threads.push({
          id: String(c.id),
          updatedAt,
          participant: { id: String(other.id), username: other.username ?? null },
          messages: (c.messages?.data ?? []).map(toMessage),
        });
      }
      url = res.data?.paging?.next ?? null;
      query = undefined;
    }
    return threads;
  }

  async sendDirectMessage({ accessToken, account, recipientId, text }: { accessToken: string; account: PublishInput['account']; recipientId: string; text: string }) {
    try {
      const res = await httpRequest<any>(`${this.graph}/${this.pageIdOf(account)}/messages`, {
        method: 'POST',
        query: { access_token: accessToken },
        json: { recipient: { id: recipientId }, message: { text } },
      });
      return { id: String(res.data.message_id) };
    } catch (err) {
      // 24 saatlik pencere dışı: Meta hata kodu 10 / alt kod 2018278
      const e = (err as ProviderError).opts?.body as any;
      if (e?.error?.error_subcode === 2018278 || /outside of allowed window/i.test((err as Error).message)) {
        throw new ProviderError('Kişinin son mesajının üzerinden 24 saatten fazla geçti; Instagram bu konuşmaya yanıt vermeye izin vermiyor.', {
          retryable: false,
          code: 'ig_window_closed',
        });
      }
      throw err;
    }
  }
}
