import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { transitionSchema } from '@/lib/validation/schemas';
import { applyInvoiceTransition } from '@/lib/invoices/transition';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export async function POST(req: NextRequest, routeCtx: { params: { id: string } }) {
  const body = await req.json();
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  return withPrivilege(
    { transition: parsed.data.transitionCode, applyRecordScope: 'INVOICES' },
    async (_req, ctx) => {
      const id = routeCtx.params.id;
      const scopeWhere = buildScopeWhere(ctx.recordScope!, {
        ownerField: 'createdById',
        teamField: 'teamId',
        branchField: 'branchId',
        departmentField: 'departmentId',
      }) as Prisma.InvoiceWhereInput;

      const invoice = await prisma.invoice.findFirst({ where: { id, ...scopeWhere } });
      if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      try {
        const updated = await applyInvoiceTransition(id, parsed.data.transitionCode);
        return NextResponse.json(serializeDecimals(updated));
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Transition failed' },
          { status: 400 },
        );
      }
    },
  )(req, routeCtx);
}
