import { BadRequestException, Body, Controller, Delete, Get, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { updateBrandingSchema, type UpdateBrandingInput } from '@oneclick/shared';
import { randomUUID } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { imageSize } from 'image-size';
import { diskStorage } from 'multer';
import { MinRole, NoDemo } from '../common/auth';
import { InjectContainer } from '../common/core';
import { ZodPipe } from '../common/zod.pipe';
import type { Container } from '../core/container';
import { tmpUploadDir } from '../core/storage';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
// SVG bilerek yok: içine script gömülebilir ve logo herkese açık adresten sunulur.
const LOGO_TYPES: Record<string, { ext: string; mime: string }> = {
  png: { ext: '.png', mime: 'image/png' },
  jpg: { ext: '.jpg', mime: 'image/jpeg' },
  webp: { ext: '.webp', mime: 'image/webp' },
};

/**
 * Beyaz etiket ayarları. Marka tüm kurulum için geçerlidir; rotadaki çalışma alanı yalnızca yetki
 * kontrolü içindir: herhangi bir (demo olmayan) çalışma alanının sahibi düzenleyebilir.
 * Okuma herkese açıktır: GET /auth/config içinde döner (giriş ekranı da markalı olsun diye).
 */
@Controller('workspaces/:wid/branding')
@MinRole('OWNER')
@NoDemo()
export class BrandingController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get()
  get() {
    return this.c.branding.get();
  }

  @Put()
  update(@Body(new ZodPipe(updateBrandingSchema)) body: UpdateBrandingInput) {
    return this.c.branding.update(body);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpUploadDir(), filename: (_req, _f, cb) => cb(null, `logo-${randomUUID()}`) }),
      limits: { fileSize: MAX_LOGO_BYTES },
    }),
  )
  async uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Dosya bulunamadı');
    try {
      // Tarayıcının bildirdiği türe değil, dosyanın içeriğine bakılır
      const type = await detectImageType(file.path);
      const t = type ? LOGO_TYPES[type] : undefined;
      if (!t) throw new BadRequestException('Logo PNG, JPEG veya WebP olmalı');
      const key = `branding/logo-${randomUUID()}${t.ext}`;
      await this.c.storage.putFile(file.path, key, t.mime);
      return await this.c.branding.setLogo(key);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Delete('logo')
  removeLogo() {
    return this.c.branding.setLogo(null);
  }
}

async function detectImageType(path: string): Promise<string | undefined> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return imageSize(buf.subarray(0, bytesRead)).type;
  } catch {
    return undefined;
  } finally {
    await fh.close();
  }
}
