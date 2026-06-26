import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { createPaymentLinkForInvoice } from '@/lib/razorpay/payment-link';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export const POST = withPrivilege(
  { action: 'PAYMENT_LINK.CREATE', applyRecordScope: 'INVOICES' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
      teamField: 'teamId',
      branchField: 'branchId',
      departmentField: 'departmentId',
    }) as Prisma.InvoiceWhereInput;

    const invoice = await prisma.invoice.findFirst({ where: { id, ...scopeWhere } });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    try {
      const link = await createPaymentLinkForInvoice(id, ctx.userId);
      return NextResponse.json(serializeDecimals(link), { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create payment link' },
        { status: 400 },
      );
    }
  },
);
