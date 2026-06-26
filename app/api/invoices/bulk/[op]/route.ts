import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { bulkIdsSchema } from '@/lib/validation/schemas';
import { toCsv } from '@/lib/api/serialize';
import { applyInvoiceTransition } from '@/lib/invoices/transition';
import type { Prisma } from '@prisma/client';

export async function POST(req: NextRequest, routeCtx: { params: { op: string } }) {
  const op = routeCtx.params.op.toLowerCase();
  const bulkCode = `INVOICE.BULK_${op.toUpperCase()}`;

  return withPrivilege({ bulkAction: bulkCode, applyRecordScope: 'INVOICES' }, async (innerReq, ctx) => {
    const body = await innerReq.json();
    const parsed = bulkIdsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
      teamField: 'teamId',
      branchField: 'branchId',
      departmentField: 'departmentId',
    }) as Prisma.InvoiceWhereInput;

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: parsed.data.ids }, ...scopeWhere },
      include: { customer: { select: { name: true } } },
    });

    if (op === 'delete') {
      await prisma.invoice.deleteMany({ where: { id: { in: invoices.map((i) => i.id) } } });
      return NextResponse.json({ ok: true, deleted: invoices.length });
    }

    if (op === 'export') {
      const csv = toCsv(
        invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          customer: i.customer.name,
          grandTotal: Number(i.grandTotal),
          invoiceDate: i.invoiceDate.toISOString(),
          dueDate: i.dueDate.toISOString(),
        })),
      );
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="invoices.csv"',
        },
      });
    }

    if (op === 'send') {
      let updated = 0;
      for (const invoice of invoices) {
        if (invoice.status !== 'DRAFT') continue;
        try {
          await applyInvoiceTransition(invoice.id, 'INVOICE.DRAFT_TO_SENT');
          updated += 1;
        } catch {
          // skip invalid transitions
        }
      }
      return NextResponse.json({ ok: true, updated });
    }

    if (op === 'mark-paid') {
      let updated = 0;
      for (const invoice of invoices) {
        if (invoice.status !== 'SENT' && invoice.status !== 'PARTIALLY_PAID') continue;
        try {
          await applyInvoiceTransition(invoice.id, 'INVOICE.SENT_TO_PAID');
          updated += 1;
        } catch {
          // skip invalid transitions
        }
      }
      return NextResponse.json({ ok: true, updated });
    }

    return NextResponse.json({ error: 'Unsupported bulk operation' }, { status: 400 });
  })(req, routeCtx);
}
