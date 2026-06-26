import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { parsePagination, paginated } from '@/lib/api/pagination';
import type { Prisma } from '@prisma/client';

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (req) => {
  const pagination = parsePagination(req);
  const status = req.nextUrl.searchParams.get('status') ?? 'PENDING';

  const where: Prisma.ApprovalRequestWhereInput = { status };

  const [total, rows] = await Promise.all([
    prisma.approvalRequest.count({ where }),
    prisma.approvalRequest.findMany({
      where,
      include: { requester: { select: { id: true, name: true, email: true } } },
      orderBy: { requestedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return NextResponse.json(paginated(rows, total, pagination));
});
