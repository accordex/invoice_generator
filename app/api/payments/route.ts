import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildInvoicePaymentScopeWhere } from '@/lib/privilege/scope';
import { parsePagination, paginated } from '@/lib/api/pagination';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export const GET = withPrivilege(
  { action: 'PAYMENT.LIST', applyRecordScope: 'INVOICES' },
  async (req, ctx) => {
    const pagination = parsePagination(req);
    const scopeWhere = buildInvoicePaymentScopeWhere(ctx.recordScope!) as Prisma.PaymentWhereInput;

    const status = req.nextUrl.searchParams.get('status');
    const where: Prisma.PaymentWhereInput = {
      ...scopeWhere,
      ...(status ? { status } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, customer: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    return NextResponse.json(paginated(serializeDecimals(rows), total, pagination));
  },
);
