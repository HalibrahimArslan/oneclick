import { DEFAULT_APP_NAME, type BrandingDto, type UpdateBrandingInput } from '@oneclick/shared';
import type { PrismaClient } from '@prisma/client';
import type { Storage } from './storage';

/** Beyaz etiket: tüm kurulumun adı, rengi ve logosu. Tabloda en fazla bir kayıt (id = 1) bulunur. */
export class BrandingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: Storage,
  ) {}

  async get(): Promise<BrandingDto> {
    const b = await this.prisma.branding.findUnique({ where: { id: 1 } });
    return {
      appName: b?.appName ?? DEFAULT_APP_NAME,
      color: b?.color ?? null,
      logoUrl: b?.logoKey ? this.storage.publicUrl(b.logoKey) : null,
    };
  }

  /** Uygulama adını sunucu tarafı metinlerde (ör. sahte izin ekranı) kullanmak için */
  async appName() {
    return (await this.get()).appName;
  }

  async update(input: UpdateBrandingInput) {
    await this.prisma.branding.upsert({
      where: { id: 1 },
      create: { id: 1, appName: input.appName, color: input.color },
      update: { appName: input.appName, color: input.color },
    });
    return this.get();
  }

  /** Yeni logoyu kaydeder; eskisi varsa depodan silinir. */
  async setLogo(key: string | null) {
    const prev = await this.prisma.branding.findUnique({ where: { id: 1 }, select: { logoKey: true } });
    await this.prisma.branding.upsert({ where: { id: 1 }, create: { id: 1, logoKey: key }, update: { logoKey: key } });
    if (prev?.logoKey && prev.logoKey !== key) await this.storage.remove(prev.logoKey).catch(() => undefined);
    return this.get();
  }
}
