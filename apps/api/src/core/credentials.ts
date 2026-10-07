import type { OAuthCredential, PrismaClient, SocialAccount } from '@prisma/client';
import { ProviderError } from '../lib/http';
import type { TokenCipher } from '../lib/crypto';
import type { ProviderRegistry, TokenSet } from '../providers';

/** Token'ları şifreli saklar, gerektiğinde yeniler. */
export class CredentialService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: TokenCipher,
    private readonly providers: ProviderRegistry,
  ) {}

  async save(socialAccountId: string, token: TokenSet) {
    const data = {
      accessTokenEnc: this.cipher.encrypt(token.accessToken),
      refreshTokenEnc: token.refreshToken ? this.cipher.encrypt(token.refreshToken) : null,
      expiresAt: token.expiresAt ?? null,
      refreshExpiresAt: token.refreshExpiresAt ?? null,
      scopes: token.scopes,
    };
    await this.prisma.oAuthCredential.upsert({
      where: { socialAccountId },
      create: { socialAccountId, ...data },
      update: data,
    });
  }

  private decode(c: OAuthCredential): TokenSet {
    return {
      accessToken: this.cipher.decrypt(c.accessTokenEnc),
      refreshToken: c.refreshTokenEnc ? this.cipher.decrypt(c.refreshTokenEnc) : null,
      expiresAt: c.expiresAt,
      refreshExpiresAt: c.refreshExpiresAt,
      scopes: c.scopes,
    };
  }

  /**
   * Geçerli erişim token'ını döner. Süresi dolmak üzereyse önce yeniler.
   * Yenilenemiyorsa hesabı NEEDS_REAUTH yapar ve kalıcı hata fırlatır.
   */
  async getAccessToken(account: SocialAccount, opts: { minValidityMs?: number } = {}): Promise<string> {
    const cred = await this.prisma.oAuthCredential.findUnique({ where: { socialAccountId: account.id } });
    if (!cred) throw await this.markReauth(account, 'Bağlantı bilgisi bulunamadı');
    const token = this.decode(cred);
    const minValidity = opts.minValidityMs ?? 5 * 60_000;
    if (!token.expiresAt || token.expiresAt.getTime() - Date.now() > minValidity) return token.accessToken;
    const refreshed = await this.refresh(account, token);
    return refreshed.accessToken;
  }

  async refresh(account: SocialAccount, current?: TokenSet): Promise<TokenSet> {
    let token = current;
    if (!token) {
      const cred = await this.prisma.oAuthCredential.findUnique({ where: { socialAccountId: account.id } });
      if (!cred) throw await this.markReauth(account, 'Bağlantı bilgisi bulunamadı');
      token = this.decode(cred);
    }
    const provider = this.providers[account.platform];
    let next: TokenSet | null;
    try {
      next = await provider.refreshToken(token);
    } catch (err) {
      if (err instanceof ProviderError && err.retryable) throw err;
      throw await this.markReauth(account, `Token yenilenemedi: ${(err as Error).message}`);
    }
    if (!next) {
      if (token.expiresAt && token.expiresAt.getTime() > Date.now()) return token;
      throw await this.markReauth(account, 'Bağlantının süresi doldu; hesabı yeniden bağlayın');
    }
    await this.save(account.id, next);
    if (account.status !== 'ACTIVE') {
      await this.prisma.socialAccount.update({ where: { id: account.id }, data: { status: 'ACTIVE', lastError: null } });
    }
    return next;
  }

  async markReauth(account: SocialAccount, reason: string) {
    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: 'NEEDS_REAUTH', lastError: reason },
    });
    return new ProviderError(reason, { retryable: false, reauth: true, code: 'needs_reauth' });
  }
}
