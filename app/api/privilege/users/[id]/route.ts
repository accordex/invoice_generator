import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';

export const GET = withPrivilege({ action: 'USER.VIEW' }, async (_req, _ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      isSuperAdmin: true,
      createdAt: true,
      roles: {
        include: { role: { select: { name: true, code: true } } },
      },
      overrides: {
        select: { targetLevel: true, targetId: true, mode: true, reason: true },
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...user,
    roles: user.roles.map((r) => ({
      role: r.role,
      assignedAt: r.assignedAt,
    })),
  });
});
