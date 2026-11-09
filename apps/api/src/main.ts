import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  // Caddy/nginx arkasında gerçek istemci IP'si (demo hız sınırı vb.) için
  if (cfg.TRUST_PROXY) app.set('trust proxy', 1);
  // /media ve panel dosyaları ServeStaticModule ile, önek dışında sunulur
  app.setGlobalPrefix('v1');
  app.use(cookieParser());
  app.enableCors({ origin: cfg.WEB_URL, credentials: true });
  app.enableShutdownHooks();
  await app.listen(cfg.PORT);
  console.log(`[api] http://localhost:${cfg.PORT}/v1 hazır`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
