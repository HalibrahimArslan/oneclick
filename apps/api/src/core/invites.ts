import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import type { InvitePreviewDto } from '@oneclick/shared';
import type { Prisma, PrismaClient, Role } from '@prisma/client';
import { randomToken, sha256 } from '../lib/crypto';

export const INVITE_TTL_MS = 7 * 864e5;
const ROLE_RANK: Record<Role, number> = { OWNER: 5, ADMIN: 4, EDITOR: 3, APPROVER: 2, VIEWER: 1 };

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Ekip davetleri: tek kullanımlık, 7 gün geçerli link. Veritabanında token'ın yalnızca sha256 özeti
 * tutulur (oturum token'ları gibi); link bu yüzden yalnızca oluşturulduğu anda gösterilebilir.
 */
export class InviteService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(workspaceId: string, createdById: string, role: Role, note?: string) {
    const token = randomToken();
    const invite = await this.prisma.invite.create({
      data: { workspaceId, createdById, role, note: note || null, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return { invite, token };
  }

  /** Kullanılabilir daveti bulur; yoksa, kullanılmışsa veya süresi dolmuşsa anlaşılır bir hata verir. */
  async findUsable(token: string, tx: Tx = this.prisma) {
    const invite = await tx.invite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { workspace: { select: { name: true, demoExpiresAt: true } }, createdBy: { select: { name: true } } },
    });
    if (!invite) throw new NotFoundException('Davet bulunamadı. Linkin tamamını kopyaladığınızdan emin olun.');
    if (invite.acceptedAt) throw new GoneException('Bu davet daha önce kullanılmış. Yöneticinizden yeni bir davet isteyin.');
    if (invite.expiresAt < new Date()) throw new GoneException('Bu davetin süresi dolmuş. Yöneticinizden yeni bir davet isteyin.');
    return invite;
  }

  async preview(token: string): Promise<InvitePreviewDto> {
    const inv = await this.findUsable(token);
    return { workspaceName: inv.workspace.name, role: inv.role, invitedBy: inv.createdBy.name };
  }

  /**
   * Daveti kullanıcı adına kabul eder. Kullanıcı zaten üyeyse daha yüksek rolü korunur.
   * Aynı link iki kez kullanılamaz (koşullu güncelleme ile yarış durumu da engellenir).
   */
  async accept(token: string, user: { id: string; isDemo: boolean }, tx: Tx = this.prisma) {
    if (user.isDemo) throw new ForbiddenException('Demo hesabıyla davet kabul edilemez.');
    const inv = await this.findUsable(token, tx);
    const claimed = await tx.invite.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) throw new BadRequestException('Bu davet az önce kullanıldı.');

    const existing = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } } });
    if (!existing) {
      await tx.workspaceMember.create({ data: { workspaceId: inv.workspaceId, userId: user.id, role: inv.role } });
    } else if (ROLE_RANK[inv.role] > ROLE_RANK[existing.role]) {
      await tx.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } }, data: { role: inv.role } });
    }
    return { workspaceId: inv.workspaceId };
  }
}
