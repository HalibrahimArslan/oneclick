import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthGuard, Public } from './common/auth';
import { CoreModule } from './common/core';
import { LOCAL_UPLOAD_DIR } from './core/storage';
import { AccountsController, OAuthController } from './modules/accounts.controller';
import { AuthController } from './modules/auth.controller';
import { MediaController } from './modules/media.controller';
import { PostsController } from './modules/posts.controller';
import { WorkspacesController } from './modules/workspaces.controller';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}

// Üretimde React panelinin derlenmiş hali API ile aynı sunucudan verilir
const WEB_DIST = resolve(__dirname, '../../web/dist');

const statics = [
  ServeStaticModule.forRoot({
    rootPath: LOCAL_UPLOAD_DIR,
    serveRoot: '/media',
    serveStaticOptions: { index: false, dotfiles: 'deny', maxAge: '7d' },
  }),
  ...(existsSync(WEB_DIST)
    ? [ServeStaticModule.forRoot({ rootPath: WEB_DIST, exclude: ['/v1/{*path}', '/media/{*path}'] })]
    : []),
];

@Module({
  imports: [CoreModule, ...statics],
  controllers: [
    HealthController,
    AuthController,
    WorkspacesController,
    AccountsController,
    OAuthController,
    MediaController,
    PostsController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
