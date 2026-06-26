import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@accordex.com' },
    include: { roles: { include: { role: true } } },
  });

  if (!user) {
    console.error('Admin user not found — run: pnpm prisma db seed');
    process.exit(1);
  }

  const passwordOk = user.passwordHash
    ? await bcrypt.compare('Password@123', user.passwordHash)
    : false;

  console.log({
    email: user.email,
    active: user.isActive,
    passwordOk,
    roles: user.roles.map((r) => r.role.code),
  });

  if (!passwordOk) {
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
