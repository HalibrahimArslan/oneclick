import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AppConfig } from '../config';

export interface Storage {
  /** Geçici dosyayı kalıcı konuma taşır/yükler */
  putFile(localPath: string, key: string, mime: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  publicUrl(key: string): string;
}

export const LOCAL_UPLOAD_DIR = resolve(process.cwd(), 'uploads');

class LocalStorage implements Storage {
  constructor(private readonly cfg: AppConfig) {}

  private path(key: string) {
    const p = resolve(LOCAL_UPLOAD_DIR, key);
    if (!p.startsWith(LOCAL_UPLOAD_DIR)) throw new Error('Geçersiz dosya yolu');
    return p;
  }

  async putFile(localPath: string, key: string) {
    const dest = this.path(key);
    await mkdir(dirname(dest), { recursive: true });
    await rename(localPath, dest);
  }

  read(key: string) {
    return readFile(this.path(key));
  }

  publicUrl(key: string) {
    return `${this.cfg.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
}

class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(private readonly cfg: AppConfig) {
    if (!cfg.S3_BUCKET) throw new Error('STORAGE_DRIVER=s3 için S3_BUCKET gerekli');
    this.client = new S3Client({
      region: cfg.S3_REGION,
      endpoint: cfg.S3_ENDPOINT || undefined,
      credentials:
        cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async putFile(localPath: string, key: string, mime: string) {
    const { size } = await stat(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.S3_BUCKET,
        Key: key,
        Body: createReadStream(localPath),
        ContentType: mime,
        ContentLength: size,
      }),
    );
  }

  async read(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  publicUrl(key: string) {
    return `${this.cfg.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
}

export function createStorage(cfg: AppConfig): Storage {
  return cfg.STORAGE_DRIVER === 's3' ? new S3Storage(cfg) : new LocalStorage(cfg);
}

export const tmpUploadDir = () => join(LOCAL_UPLOAD_DIR, '.tmp');
