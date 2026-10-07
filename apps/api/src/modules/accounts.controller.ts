import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Query, Res } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PLATFORMS, type Platform } from '@oneclick/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentMember, CurrentUser, MinRole, Public, type AuthUser, type Membership } from '../common/auth';
import { InjectContainer } from '../common/core';
import { toAccountDto } from '../common/serializers';
import { ZodPipe } from '../common/zod.pipe';
import { oauthRedirectUri } from '../config';
import type { Container } from '../core/container';
import { randomToken } from '../lib/crypto';

const STATE_TTL_S = 600;

interface OAuthState {
  workspaceId: string;
  userId: string;
  platform: Platform;
  brandId: string | null;
}

const parsePlatform = (p: string): Platform => {
  const up = p.toUpperCase() as Platform;
  if (!PLATFORMS.includes(up)) throw new BadRequestException('Bilinmeyen platform');
  return up;
};

@Controller('workspaces/:wid/accounts')
export class AccountsController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get()
  async list(@Param('wid') wid: string) {
    const accounts = await this.c.prisma.socialAccount.findMany({
      where: { workspaceId: wid, status: { not: 'DISCONNECTED' } },
      orderBy: [{ platform: 'asc' }, { name: 'asc' }],
    });
    return accounts.map(toAccountDto);
  }

  /** OAuth akışını başlatır; dönen url'ye tarayıcı yönlendirilir. */
  @Get('connect/:platform')
  @MinRole('ADMIN')
  async connect(
    @Param('platform') platformParam: string,
    @CurrentUser() u: AuthUser,
    @CurrentMember() m: Membership,
    @Query('brandId') brandId?: string,
  ) {
    const platform = parsePlatform(platformParam);
    const provider = this.c.providers[platform];
    if (!provider.isConfigured()) {
      throw new BadRequestException(`${platform} için uygulama anahtarları .env dosyasında tanımlı değil`);
    }
    const state = randomToken(24);
    const data: OAuthState = { workspaceId: m.workspaceId, userId: u.id, platform, brandId: brandId ?? null };
    await this.c.redis.set(`oauth:state:${state}`, JSON.stringify(data), 'EX', STATE_TTL_S);
    return { url: provider.getAuthUrl({ state, redirectUri: oauthRedirectUri(this.c.cfg, platform) }) };
  }

  /** TikTok composer kuralları için creator_info (takma ad, izinli görünürlükler). */
  @Get(':id/capabilities')
  async capabilities(@Param('wid') wid: string, @Param('id') id: string) {
    const account = await this.c.prisma.socialAccount.findFirst({ where: { id, workspaceId: wid } });
    if (!account) throw new NotFoundException();
    const provider = this.c.providers[account.platform];
    if (!provider.getAccountCapabilities) return {};
    const accessToken = await this.c.credentials.getAccessToken(account);
    return provider.getAccountCapabilities({
      accessToken,
      account: {
        id: account.id,
        accountType: account.accountType,
        externalId: account.externalId,
        metadata: (account.metadata as Record<string, unknown>) ?? null,
      },
    });
  }

  @Patch(':id')
  @MinRole('ADMIN')
  async update(
    @Param('wid') wid: string,
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ brandId: z.string().uuid().nullable() }))) body: { brandId: string | null },
  ) {
    const account = await this.c.prisma.socialAccount.findFirst({ where: { id, workspaceId: wid } });
    if (!account) throw new NotFoundException();
    return toAccountDto(await this.c.prisma.socialAccount.update({ where: { id }, data: { brandId: body.brandId } }));
  }

  /** Hesabı koparır: token'lar silinir, geçmiş gönderiler korunur. */
  @Delete(':id')
  @MinRole('ADMIN')
  @HttpCode(204)
  async disconnect(@Param('wid') wid: string, @Param('id') id: string) {
    const account = await this.c.prisma.socialAccount.findFirst({ where: { id, workspaceId: wid } });
    if (!account) throw new NotFoundException();
    await this.c.prisma.$transaction([
      this.c.prisma.oAuthCredential.deleteMany({ where: { socialAccountId: id } }),
      this.c.prisma.socialAccount.update({ where: { id }, data: { status: 'DISCONNECTED' } }),
    ]);
  }
}

/** Platformların geri döndüğü OAuth uç noktaları (oturum gerektirmez; kimlik state'ten gelir). */
@Controller('oauth')
export class OAuthController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Public()
  @Get('callback/:platform')
  async callback(
    @Param('platform') platformParam: string,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const back = (params: Record<string, string>) =>
      res.redirect(`${this.c.cfg.WEB_URL}/accounts?${new URLSearchParams(params).toString()}`);

    if (q.error) return back({ error: q.error_description || q.error });
    if (!q.code || !q.state) return back({ error: 'Eksik yanıt' });

    const key = `oauth:state:${q.state}`;
    const raw = await this.c.redis.get(key);
    await this.c.redis.del(key);
    if (!raw) return back({ error: 'Bağlantı isteğinin süresi doldu, tekrar deneyin' });
    const state = JSON.parse(raw) as OAuthState;

    const platform = parsePlatform(platformParam);
    if (platform !== state.platform) return back({ error: 'Platform uyuşmazlığı' });

    try {
      const provider = this.c.providers[platform];
      const infos = await provider.exchangeCode({ code: q.code, redirectUri: oauthRedirectUri(this.c.cfg, platform) });
      for (const info of infos) {
        const account = await this.c.prisma.socialAccount.upsert({
          where: {
            workspaceId_platform_externalId: { workspaceId: state.workspaceId, platform, externalId: info.externalId },
          },
          create: {
            workspaceId: state.workspaceId,
            brandId: state.brandId,
            platform,
            accountType: info.accountType,
            externalId: info.externalId,
            name: info.name,
            username: info.username ?? null,
            avatarUrl: info.avatarUrl ?? null,
            metadata: (info.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            connectedById: state.userId,
          },
          update: {
            name: info.name,
            username: info.username ?? null,
            avatarUrl: info.avatarUrl ?? null,
            metadata: (info.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            status: 'ACTIVE',
            lastError: null,
          },
        });
        await this.c.credentials.save(account.id, info.token);
      }
      await this.c.prisma.auditLog.create({
        data: {
          workspaceId: state.workspaceId,
          actorId: state.userId,
          action: 'account.connected',
          entity: 'social_account',
          data: { platform, count: infos.length },
        },
      });
      return back({ connected: platform.toLowerCase(), count: String(infos.length) });
    } catch (err) {
      return back({ error: `Bağlantı başarısız: ${(err as Error).message}` });
    }
  }

  /** Mock platform için sahte izin ekranı (yalnızca ENABLE_MOCK_PROVIDER=true iken). */
  @Public()
  @Get('mock-authorize')
  mockAuthorize(@Query('state') state: string, @Query('redirect_uri') redirectUri: string, @Res() res: Response) {
    if (!this.c.cfg.ENABLE_MOCK_PROVIDER) return res.status(404).send('Not found');
    if (!redirectUri?.startsWith(this.c.cfg.API_PUBLIC_URL)) return res.status(400).send('Geçersiz yönlendirme');
    const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    res.type('html').send(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test platformu – izin</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f4f5;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;padding:28px;border-radius:12px;box-shadow:0 1px 3px #0002;width:340px}
h1{font-size:18px;margin:0 0 8px}p{color:#555;font-size:14px}input{width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box}
button{margin-top:16px;width:100%;padding:10px;border:0;border-radius:6px;background:#111;color:#fff;font-weight:600;cursor:pointer}</style></head>
<body><form method="get" action="${esc(redirectUri)}">
<h1>OneClick hesabınıza erişmek istiyor</h1>
<p>Bu, gerçek platform yerine kullanılan test ekranıdır. İzin verirseniz OneClick bu hesapta gönderi paylaşabilir.</p>
<label>Hesap adı<input name="code_name" value="Test Hesabı" oninput="this.form.code.value='mock:'+encodeURIComponent(this.value)"></label>
<input type="hidden" name="code" value="mock:Test%20Hesab%C4%B1"><input type="hidden" name="state" value="${esc(state)}">
<button type="submit">İzin ver</button></form></body></html>`);
  }
}
