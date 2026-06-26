import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { invoiceSchema } from '@/lib/validation/schemas';
import { parsePagination, paginated } from '@/lib/api/pagination';
import { serializeDecimals } from '@/lib/api/serialize';
import { createInvoiceRecord } from '@/lib/invoices/service';
import type { Prisma } from '@prisma/client';

export const GET = withPrivilege(
  { action: 'INVOICE.LIST', applyRecordScope: 'INVOICES' },
  async (req, ctx) => {
    const pagination = parsePagination(req);
    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
      teamField: 'teamId',
      branchField: 'branchId',
      departmentField: 'departmentId',
    }) as Prisma.InvoiceWhereInput;

    const status = req.nextUrl.searchParams.get('status');
    const where: Prisma.InvoiceWhereInput = {
      ...scopeWhere,
      ...(status ? { status } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    return NextResponse.json(paginated(serializeDecimals(rows), total, pagination));
  },
);

export const POST = withPrivilege({ action: 'INVOICE.CREATE' }, async (req, ctx) => {
  const body = await req.json();
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.invoiceNumber) {
    const clash = await prisma.invoice.findUnique({ where: { invoiceNumber: parsed.data.invoiceNumber } });
    if (clash) {
      return NextResponse.json({ error: 'Invoice number already exists' }, { status: 409 });
    }
  }

  const invoice = await createInvoiceRecord({
    ...parsed.data,
    createdById: ctx.userId,
    teamId: ctx.teamId,
    branchId: ctx.branchId,
    departmentId: ctx.departmentId,
  });

  return NextResponse.json(serializeDecimals(invoice), { status: 201 });
});
