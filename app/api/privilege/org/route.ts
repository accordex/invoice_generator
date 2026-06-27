import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';

/**
 * Returns organisation units for user assignment forms.
 */
export const GET = withPrivilege({ action: 'USER.VIEW' }, async () => {
  const [teams, branches, departments] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.branch.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return NextResponse.json({ teams, branches, departments });
});
