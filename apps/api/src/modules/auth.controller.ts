import { Body, ConflictException, Controller, ForbiddenException, Get, HttpException, HttpStatus, NotFoundException, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@oneclick/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Public, signAccessToken, type AuthUser } from '../common/auth';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';
import { randomToken, sha256 } from '../lib/crypto';

const REFRESH_COOKIE = 'oc_rt';
const REFRESH_TTL_MS = 30 * 864e5;

@Controller('auth')
export class AuthController {
  constructor(@InjectContainer() private readonly c: Container) {}

  /** Giriş ekranı için: kayıt açık mı (ilk kullanıcı her zaman kayıt olabilir), marka */
  @Public()
  @Get('config')
  async config() {
    return {
      registrationOpen: await this.registrationOpen(),
      demoMode: this.c.cfg.DEMO_MODE,
      demoTtlHours: this.c.cfg.DEMO_TTL_HOURS,
      branding: await this.c.branding.get(),
    };
  }

  /** "Demoyu dene": örnek verili geçici çalışma alanı açar ve oturum başlatır. */
  @Public()
  @Post('demo')
  async demo(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!this.c.cfg.DEMO_MODE) throw new NotFoundException();
    // Aynı adresten saatte en fazla 10 demo
    const key = `demo:ip:${req.ip ?? 'unknown'}`;
    const n = await this.c.redis.incr(key);
    if (n === 1) await this.c.redis.expire(key, 3600);
    if (n > 10) throw new HttpException('Çok fazla demo isteği. Lütfen biraz sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    const { user } = await this.c.demo.create();
    return this.issue(user, req, res);
  }

  private async registrationOpen() {
    if (this.c.cfg.ALLOW_REGISTRATION) return true;
    return (await this.c.prisma.user.count()) === 0;
  }

  @Public()
  @Post('register')
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await this.registrationOpen())) throw new ForbiddenException('Yeni kayıtlar kapalı. Hesap için yöneticinizle görüşün.');
    const exists = await this.c.prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new ConflictException('Bu e-posta ile kayıtlı bir hesap var');

    const user = await this.c.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: body.email, name: body.name, passwordHash: await hash(body.password) },
      });
      const ws = await tx.workspace.create({ data: { name: body.workspaceName || `${body.name} çalışma alanı` } });
      await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: 'OWNER' } });
      return u;
    });
    return this.issue(user, req, res);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.c.prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verify(user.passwordHash, body.password))) {
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }
    return this.issue(user, req, res);
  }

  /** Refresh cookie ile yeni erişim token'ı verir; refresh token'ı döndürür (rotation). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException('Oturum bulunamadı');
    const session = await this.c.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(raw) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOpts());
      throw new UnauthorizedException('Oturumun süresi doldu');
    }
    await this.c.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issue(session.user, req, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      await this.c.prisma.session.updateMany({ where: { refreshTokenHash: sha256(raw) }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(REFRESH_COOKIE, this.cookieOpts());
  }

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.c.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } },
    });
    return {
      user: { id: user.id, email: user.email, name: user.name },
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        role: m.role,
        demoExpiresAt: m.workspace.demoExpiresAt?.toISOString() ?? null,
      })),
    };
  }

  private cookieOpts() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.c.cfg.NODE_ENV === 'production',
      path: '/v1/auth',
    };
  }

  private async issue(user: { id: string; email: string; name: string }, req: Request, res: Response) {
    const refresh = randomToken();
    await this.c.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refresh),
        userAgent: req.headers['user-agent']?.slice(0, 255),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    res.cookie(REFRESH_COOKIE, refresh, { ...this.cookieOpts(), maxAge: REFRESH_TTL_MS });
    const accessToken = await signAccessToken(this.c.cfg.JWT_SECRET, user);
    return { accessToken, user: { id: user.id, email: user.email, name: user.name } };
  }
}
