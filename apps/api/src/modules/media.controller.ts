import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ConflictException,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { extname } from 'node:path';
import { promisify } from 'node:util';
import { imageSize } from 'image-size';
import { diskStorage } from 'multer';
import { CurrentUser, MinRole, type AuthUser } from '../common/auth';
import { InjectContainer } from '../common/core';
import { toMediaDto } from '../common/serializers';
import type { Container } from '../core/container';
import { tmpUploadDir } from '../core/storage';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

const tmpDir = tmpUploadDir();
mkdirSync(tmpDir, { recursive: true });

@Controller('workspaces/:wid/media')
export class MediaController {
  constructor(@InjectContainer() private readonly c: Container) {}

  @Get()
  async list(@Param('wid') wid: string) {
    const items = await this.c.prisma.mediaAsset.findMany({
      where: { workspaceId: wid, status: 'READY' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return items.map((m) => toMediaDto(m, this.c.storage));
  }

  @Post()
  @MinRole('EDITOR')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpDir, filename: (_req, f, cb) => cb(null, `${randomUUID()}${extname(f.originalname)}`) }),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, f, cb) => {
        if (/^(image|video)\//.test(f.mimetype)) cb(null, true);
        else cb(new BadRequestException('Yalnızca görsel veya video yüklenebilir'), false);
      },
    }),
  )
  async upload(@Param('wid') wid: string, @CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Dosya bulunamadı');
    try {
      const meta = await probe(file.path, file.mimetype);
      const id = randomUUID();
      const ext = (extname(file.originalname) || mimeExt(file.mimetype)).toLowerCase();
      const key = `${wid}/${id}${ext}`;
      await this.c.storage.putFile(file.path, key, file.mimetype);
      const asset = await this.c.prisma.mediaAsset.create({
        data: {
          id,
          workspaceId: wid,
          uploadedById: u.id,
          fileName: file.originalname.slice(0, 255),
          storageKey: key,
          mime: file.mimetype,
          sizeBytes: file.size,
          status: 'READY',
          ...meta,
        },
      });
      return toMediaDto(asset, this.c.storage);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Delete(':id')
  @MinRole('EDITOR')
  @HttpCode(204)
  async remove(@Param('wid') wid: string, @Param('id') id: string) {
    const asset = await this.c.prisma.mediaAsset.findFirst({ where: { id, workspaceId: wid }, include: { posts: true } });
    if (!asset) throw new NotFoundException();
    if (asset.posts.length) throw new ConflictException('Bu medya bir gönderide kullanılıyor');
    await this.c.prisma.mediaAsset.delete({ where: { id } });
  }
}

async function probe(path: string, mime: string): Promise<{ width: number | null; height: number | null; durationS: number | null }> {
  if (mime.startsWith('image/')) {
    try {
      const fh = await open(path, 'r');
      const buf = Buffer.alloc(512 * 1024);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      await fh.close();
      const dim = imageSize(buf.subarray(0, bytesRead));
      return { width: dim.width ?? null, height: dim.height ?? null, durationS: null };
    } catch {
      return { width: null, height: null, durationS: null };
    }
  }
  // Video: ffprobe kuruluysa süre ve boyut okunur
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json', path,
    ]);
    const j = JSON.parse(stdout);
    return {
      width: j.streams?.[0]?.width ?? null,
      height: j.streams?.[0]?.height ?? null,
      durationS: j.format?.duration ? Number(j.format.duration) : null,
    };
  } catch {
    return { width: null, height: null, durationS: null };
  }
}

const mimeExt = (mime: string) =>
  ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/quicktime': '.mov' })[
    mime
  ] ?? '';
