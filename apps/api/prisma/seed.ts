import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

/** Yerel geliştirme için demo kullanıcı: demo@oneclick.local / demo12345 */
async function main() {
  const prisma = new PrismaClient();
  const email = 'demo@oneclick.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Demo kullanıcı zaten var:', email);
    return prisma.$disconnect();
  }
  const user = await prisma.user.create({
    data: { email, name: 'Demo Kullanıcı', passwordHash: await hash('demo12345') },
  });
  await prisma.workspace.create({
    data: {
      name: 'Demo Ajans',
      members: { create: { userId: user.id, role: 'OWNER' } },
      brands: { create: [{ name: 'Marka A' }, { name: 'Marka B' }] },
    },
  });
  console.log('Demo kullanıcı oluşturuldu: demo@oneclick.local / demo12345');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
