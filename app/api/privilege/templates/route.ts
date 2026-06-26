import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async () => {
  const templates = await prisma.privilegeTemplate.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(templates);
});
