import { prisma } from '../lib/prisma';
import { recomputeEffectivePrivileges } from '../lib/privilege/resolver';

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  for (const user of users) {
    await recomputeEffectivePrivileges(user.id);
    console.log('recomputed', user.email);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
