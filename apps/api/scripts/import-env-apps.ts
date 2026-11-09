/**
 * .env'deki platform uygulama bilgilerini (INSTAGRAM_APP_ID, LINKEDIN_CLIENT_ID, ...)
 * bir çalışma alanına kaydeder. Kullanım:
 *   pnpm apps:import-env <kullanıcı e-postası>
 * Kullanıcının OWNER olduğu tüm çalışma alanlarına kopyalanır; panelden girilmiş bilgilerin üzerine yazılmaz.
 */
import { loadConfig } from '../src/config';
import { PlatformAppService, REAL_PLATFORMS } from '../src/core/platform-apps';
import { TokenCipher } from '../src/lib/crypto';
import { getPrisma } from '../src/lib/prisma';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Kullanım: pnpm apps:import-env <e-posta>');
  const cfg = loadConfig();
  const prisma = getPrisma();
  const apps = new PlatformAppService(prisma, new TokenCipher(cfg.ENCRYPTION_KEY), cfg);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { where: { role: 'OWNER' }, include: { workspace: true } } },
  });
  if (!user) throw new Error(`Kullanıcı bulunamadı: ${email}`);

  for (const m of user.memberships) {
    for (const platform of REAL_PLATFORMS) {
      const env = apps.envApp(platform);
      if (!env) continue;
      const exists = await prisma.platformApp.findUnique({
        where: { workspaceId_platform: { workspaceId: m.workspaceId, platform } },
      });
      if (exists) {
        console.log(`- ${m.workspace.name} / ${platform}: zaten kayıtlı, atlandı`);
        continue;
      }
      await apps.save(m.workspaceId, platform, { clientId: env.clientId, clientSecret: env.clientSecret, options: env.options });
      console.log(`✓ ${m.workspace.name} / ${platform}: kaydedildi`);
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
