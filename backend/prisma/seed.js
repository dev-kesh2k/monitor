import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Cria o admin inicial (SEED_ADMIN_*) só se ainda não existir: não sobrescreve senha trocada no app.
const prisma = new PrismaClient();

async function main() {
  const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SEED_ADMIN_PASSWORD || '');
  const name = String(process.env.SEED_ADMIN_NAME || 'Administrador').trim();
  if (!email || password.length < 8) {
    console.warn('Seed: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD ausentes; nenhum admin criado.');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed: admin ${email} já existe.`);
    return;
  }
  await prisma.user.create({
    data: { name, email, role: 'admin', passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Seed: admin ${email} criado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
