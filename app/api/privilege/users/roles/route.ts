import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';

/**
 * Lists assignable roles for user create/edit forms (excludes SUPER_ADMIN).
 */
export const GET = withPrivilege({ action: 'USER.VIEW' }, async () => {
  const roles = await prisma.role.findMany({
    where: { code: { not: 'SUPER_ADMIN' } },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, description: true },
  });
  return NextResponse.json(roles);
});
