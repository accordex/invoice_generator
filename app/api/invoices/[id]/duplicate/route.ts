import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { duplicateInvoiceRecord } from '@/lib/invoices/service';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export const POST = withPrivilege(
  { action: 'INVOICE.DUPLICATE', applyRecordScope: 'INVOICES' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
      teamField: 'teamId',
      branchField: 'branchId',
      departmentField: 'departmentId',
    }) as Prisma.InvoiceWhereInput;

    const source = await prisma.invoice.findFirst({ where: { id, ...scopeWhere } });
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const duplicate = await duplicateInvoiceRecord(id, ctx.userId);
    return NextResponse.json(serializeDecimals(duplicate), { status: 201 });
  },
);
