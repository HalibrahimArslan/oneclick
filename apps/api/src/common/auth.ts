import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import type { Container } from '../core/container';
import { InjectContainer } from './core';

export interface AuthUser {
  id: string;
  email: string;
}

export interface Membership {
  workspaceId: string;
  role: Role;
}

type AuthedRequest = Request & { user?: AuthUser; member?: Membership };

const secretKey = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(secret: string, user: AuthUser) {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secretKey(secret));
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

const ROLE_RANK: Record<Role, number> = { OWNER: 5, ADMIN: 4, EDITOR: 3, APPROVER: 2, VIEWER: 1 };
export const MIN_ROLE = 'minRole';
/** Bu uç nokta için gereken en düşük workspace rolü */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);

/**
 * Global guard:
 *  1) @Public değilse Bearer JWT doğrular.
 *  2) Rotada :wid varsa üyeliği doğrular, @MinRole kontrol eder.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @InjectContainer() private readonly c: Container,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Oturum gerekli');
    try {
      const { payload } = await jwtVerify(token, secretKey(this.c.cfg.JWT_SECRET));
      req.user = { id: payload.sub!, email: String(payload.email) };
    } catch {
      throw new UnauthorizedException('Oturumun süresi doldu');
    }

    const wid = (req.params as Record<string, string>)?.wid;
    if (wid) {
      const m = await this.c.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: wid, userId: req.user.id } },
      });
      if (!m) throw new NotFoundException('Çalışma alanı bulunamadı');
      req.member = { workspaceId: wid, role: m.role };
      const minRole = this.reflector.getAllAndOverride<Role>(MIN_ROLE, [ctx.getHandler(), ctx.getClass()]) ?? 'VIEWER';
      if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});

export const CurrentMember = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().member!;
});
