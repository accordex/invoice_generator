import { prisma } from '../lib/prisma';
import { resolveOne } from '../lib/privilege/resolver';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@accordex.com' },
    include: { roles: { include: { role: true } } },
  });

  if (!user) {
    console.error('Admin not found');
    process.exit(1);
  }

  const privilege = await resolveOne(user.id, 'ACTION', 'PRIVILEGE.MANAGE');
  const cached = await prisma.effectivePrivilege.findUnique({
    where: {
      userId_targetLevel_targetId: {
        userId: user.id,
        targetLevel: 'ACTION',
        targetId: 'PRIVILEGE.MANAGE',
      },
    },
  });

  const actionDef = await prisma.actionDef.findFirst({
    where: { code: 'PRIVILEGE.MANAGE' },
  });

  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  const grant = adminRole
    ? await prisma.rolePrivilegeGrant.findFirst({
        where: {
          roleId: adminRole.id,
          targetLevel: 'ACTION',
          targetId: 'PRIVILEGE.MANAGE',
        },
      })
    : null;

  console.log({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    roles: user.roles.map((r) => r.role.code),
    actionDefCode: actionDef?.code,
    grantMode: grant?.mode,
    effectiveMode: privilege.mode,
    cached: cached?.mode,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
