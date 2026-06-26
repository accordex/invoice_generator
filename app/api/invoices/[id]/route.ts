import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { invoiceSchema } from '@/lib/validation/schemas';
import { serializeDecimals } from '@/lib/api/serialize';
import { updateInvoiceRecord } from '@/lib/invoices/service';
import type { Prisma } from '@prisma/client';

import type { PrivilegedContext } from '@/lib/privilege/withPrivilege';

function invoiceScopeWhere(ctx: PrivilegedContext) {
  return buildScopeWhere(ctx.recordScope!, {
    ownerField: 'createdById',
    teamField: 'teamId',
    branchField: 'branchId',
    departmentField: 'departmentId',
  }) as Prisma.InvoiceWhereInput;
}

export const GET = withPrivilege(
  { action: 'INVOICE.VIEW', applyRecordScope: 'INVOICES' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const invoice = await prisma.invoice.findFirst({
      where: { id, ...invoiceScopeWhere(ctx) },
      include: { lineItems: true, customer: true, payments: true, paymentLinks: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(serializeDecimals(invoice));
  },
);

export const PATCH = withPrivilege(
  { action: 'INVOICE.EDIT', applyRecordScope: 'INVOICES' },
  async (req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.invoice.findFirst({
      where: { id, ...invoiceScopeWhere(ctx) },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.status === 'PAID' || existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot edit terminal invoice' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = invoiceSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const invoice = await updateInvoiceRecord(id, parsed.data);
    return NextResponse.json(serializeDecimals(invoice));
  },
);

export const DELETE = withPrivilege(
  { action: 'INVOICE.DELETE', applyRecordScope: 'INVOICES' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.invoice.findFirst({
      where: { id, ...invoiceScopeWhere(ctx) },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
