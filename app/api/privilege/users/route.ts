import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { parsePagination, paginated } from '@/lib/api/pagination';

export const GET = withPrivilege({ action: 'USER.LIST' }, async (req) => {
  const pagination = parsePagination(req);

  const [total, rows] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
        roles: { include: { role: { select: { name: true, code: true } } } },
      },
    }),
  ]);

  return NextResponse.json(paginated(rows, total, pagination));
});
