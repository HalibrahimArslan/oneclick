import type { AppConfig } from '../config';
import { httpRequest, ProviderError, sleep } from '../lib/http';
import { secondsFromNow, type ConnectedAccountInfo, type PublishInput, type PublishMedia, type PublishResult, type SocialProvider, type TokenSet } from './types';

const REST = 'https://api.linkedin.com/rest';

/**
 * LinkedIn: kişisel profil (Share on LinkedIn, self-servis) ve
 * şirket sayfası (Community Management API, onay gerekir).
 * LinkedIn'in zamanlama API'si yoktur; zamanlamayı kuyruğumuz yapar.
 */
export class LinkedInProvider implements SocialProvider {
  readonly platform = 'LINKEDIN' as const;

  constructor(private readonly cfg: AppConfig) {}

  isConfigured() {
    return Boolean(this.cfg.LINKEDIN_CLIENT_ID && this.cfg.LINKEDIN_CLIENT_SECRET);
  }

  private headers(at: string) {
    return {
      authorization: `Bearer ${at}`,
      'linkedin-version': this.cfg.LINKEDIN_API_VERSION,
      'x-restli-protocol-version': '2.0.0',
    };
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const scopes = ['openid', 'profile', 'w_member_social'];
    if (this.cfg.LINKEDIN_ORGANIZATIONS_ENABLED) {
      scopes.push('w_organization_social', 'r_organization_social', 'rw_organization_admin');
    }
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.LINKEDIN_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('scope', scopes.join(' '));
    return u.toString();
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccountInfo[]> {
    const res = await httpRequest<any>('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.cfg.LINKEDIN_CLIENT_ID!,
        client_secret: this.cfg.LINKEDIN_CLIENT_SECRET!,
      },
    });
    const token: TokenSet = {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token ?? null,
      expiresAt: secondsFromNow(res.data.expires_in),
      refreshExpiresAt: secondsFromNow(res.data.refresh_token_expires_in),
      scopes: typeof res.data.scope === 'string' ? res.data.scope.split(/[ ,]/) : [],
    };

    const me = await httpRequest<any>('https://api.linkedin.com/v2/userinfo', {
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    const accounts: ConnectedAccountInfo[] = [
      {
        accountType: 'LI_MEMBER',
        externalId: me.data.sub,
        name: me.data.name ?? [me.data.given_name, me.data.family_name].filter(Boolean).join(' '),
        username: null,
        avatarUrl: me.data.picture ?? null,
        metadata: { authorUrn: `urn:li:person:${me.data.sub}` },
        token,
      },
    ];

    if (this.cfg.LINKEDIN_ORGANIZATIONS_ENABLED) {
      const orgIds = new Set<string>();
      for (const role of ['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR']) {
        try {
          const acl = await httpRequest<any>(`${REST}/organizationAcls`, {
            query: { q: 'roleAssignee', role, state: 'APPROVED' },
            headers: this.headers(token.accessToken),
          });
          for (const el of acl.data.elements ?? []) {
            const urn: string = el.organization ?? el.organizationTarget;
            if (urn) orgIds.add(urn.split(':').pop()!);
          }
        } catch {
          /* rol listesi alınamazsa yalnızca kişisel profil bağlanır */
        }
      }
      for (const id of orgIds) {
        let name = `Şirket sayfası ${id}`;
        let vanity: string | null = null;
        try {
          const org = await httpRequest<any>(`${REST}/organizations/${id}`, { headers: this.headers(token.accessToken) });
          name = org.data.localizedName ?? name;
          vanity = org.data.vanityName ?? null;
        } catch {
          /* ad alınamazsa varsayılan */
        }
        accounts.push({
          accountType: 'LI_ORGANIZATION',
          externalId: `org:${id}`,
          name,
          username: vanity,
          avatarUrl: null,
          metadata: { authorUrn: `urn:li:organization:${id}` },
          token,
        });
      }
    }
    return accounts;
  }

  async refreshToken(token: TokenSet): Promise<TokenSet | null> {
    // Programatik yenileme yalnızca LinkedIn'in onayladığı ortaklara açık
    if (!token.refreshToken) return null;
    const res = await httpRequest<any>('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      form: {
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: this.cfg.LINKEDIN_CLIENT_ID!,
        client_secret: this.cfg.LINKEDIN_CLIENT_SECRET!,
      },
    });
    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token ?? token.refreshToken,
      expiresAt: secondsFromNow(res.data.expires_in),
      refreshExpiresAt: secondsFromNow(res.data.refresh_token_expires_in) ?? token.refreshExpiresAt,
      scopes: token.scopes,
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const at = input.accessToken;
    const author: string = input.account.metadata?.authorUrn;
    if (!author) throw new ProviderError('LinkedIn yazar bilgisi eksik; hesabı yeniden bağlayın', { retryable: false, reauth: true });
    const state = { ...input.state };

    if (state.postUrn) return { externalPostId: state.postUrn, permalink: permalinkFor(state.postUrn) };

    // Medyayı yükle (her öğe kaydedilir, yeniden denemede tekrar yüklenmez)
    const uploaded: string[] = state.uploaded ?? [];
    for (let i = uploaded.length; i < input.media.length; i++) {
      const m = input.media[i];
      const urn = m.mime.startsWith('video/') ? await this.uploadVideo(at, author, m) : await this.uploadImage(at, author, m);
      uploaded.push(urn);
      state.uploaded = uploaded;
      await input.saveState(state);
    }

    let content: unknown = undefined;
    if (uploaded.length === 1) content = { media: { id: uploaded[0] } };
    else if (uploaded.length > 1) content = { multiImage: { images: uploaded.map((id) => ({ id })) } };

    const res = await httpRequest<any>(`${REST}/posts`, {
      method: 'POST',
      headers: this.headers(at),
      json: {
        author,
        commentary: toLittleText(input.text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {}),
      },
    });
    const urn = res.headers.get('x-restli-id') ?? res.data?.id;
    if (!urn) throw new ProviderError('LinkedIn gönderi kimliği dönmedi', { retryable: false });
    state.postUrn = urn;
    await input.saveState(state);
    return { externalPostId: urn, permalink: permalinkFor(urn) };
  }

  private async uploadImage(at: string, owner: string, m: PublishMedia): Promise<string> {
    const init = await httpRequest<any>(`${REST}/images`, {
      method: 'POST',
      query: { action: 'initializeUpload' },
      headers: this.headers(at),
      json: { initializeUploadRequest: { owner } },
    });
    const { uploadUrl, image } = init.data.value;
    const bytes = await m.read();
    await httpRequest(uploadUrl, {
      method: 'PUT',
      headers: { authorization: `Bearer ${at}`, 'content-type': m.mime },
      body: new Uint8Array(bytes),
      timeoutMs: 5 * 60_000,
    });
    return image;
  }

  private async uploadVideo(at: string, owner: string, m: PublishMedia): Promise<string> {
    const bytes = await m.read();
    const init = await httpRequest<any>(`${REST}/videos`, {
      method: 'POST',
      query: { action: 'initializeUpload' },
      headers: this.headers(at),
      json: {
        initializeUploadRequest: { owner, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false },
      },
    });
    const { video, uploadToken, uploadInstructions } = init.data.value;
    const partIds: string[] = [];
    for (const ins of uploadInstructions as { uploadUrl: string; firstByte: number; lastByte: number }[]) {
      const chunk = bytes.subarray(ins.firstByte, ins.lastByte + 1);
      const put = await httpRequest(ins.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(chunk),
        timeoutMs: 10 * 60_000,
      });
      const etag = put.headers.get('etag');
      if (etag) partIds.push(etag);
    }
    await httpRequest(`${REST}/videos`, {
      method: 'POST',
      query: { action: 'finalizeUpload' },
      headers: this.headers(at),
      json: { finalizeUploadRequest: { video, uploadToken: uploadToken ?? '', uploadedPartIds: partIds } },
    });

    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      const st = await httpRequest<any>(`${REST}/videos/${encodeURIComponent(video)}`, { headers: this.headers(at) });
      if (st.data.status === 'AVAILABLE') return video;
      if (st.data.status === 'PROCESSING_FAILED') {
        throw new ProviderError('LinkedIn videoyu işleyemedi', { retryable: false, code: 'li_video_failed' });
      }
      await sleep(5000);
    }
    throw new ProviderError('LinkedIn video işleme hâlâ sürüyor', { retryable: true, code: 'li_video_processing' });
  }
}

const permalinkFor = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

/**
 * LinkedIn "little text" biçimi: ayrılmış karakterler kaçışlanmalı.
 * #etiket ifadeleri hashtag şablonuna çevrilir.
 */
export function toLittleText(text: string): string {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u);
  return parts
    .map((p) => {
      if (/^#[\p{L}\p{N}_]+$/u.test(p)) return `{hashtag|\\#|${p.slice(1)}}`;
      return p.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
    })
    .join('');
}
