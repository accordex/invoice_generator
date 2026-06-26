import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { parsePagination, paginated } from '@/lib/api/pagination';
import type { Prisma } from '@prisma/client';

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (req) => {
  const pagination = parsePagination(req);
  const action = req.nextUrl.searchParams.get('action');

  const where: Prisma.PrivilegeAuditLogWhereInput = action ? { action: { contains: action, mode: 'insensitive' } } : {};

  const [total, rows] = await Promise.all([
    prisma.privilegeAuditLog.count({ where }),
    prisma.privilegeAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  const actorIds = Array.from(new Set(rows.map((r) => r.actorUserId)));
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, email: true },
  });
  const emailById = Object.fromEntries(actors.map((a) => [a.id, a.email]));

  const data = rows.map((r) => ({
    ...r,
    actorEmail: emailById[r.actorUserId],
    targetType: r.targetLevel,
  }));

  return NextResponse.json(paginated(data, total, pagination));
});
