import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { bulkIdsSchema } from '@/lib/validation/schemas';
import { toCsv } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export async function POST(req: NextRequest, routeCtx: { params: { op: string } }) {
  const op = routeCtx.params.op.toLowerCase();
  const bulkCode = `CUSTOMER.BULK_${op.toUpperCase()}`;

  return withPrivilege({ bulkAction: bulkCode, applyRecordScope: 'CUSTOMERS' }, async (innerReq, ctx) => {
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
    }) as Prisma.CustomerWhereInput;

    const customers = await prisma.customer.findMany({
      where: { id: { in: parsed.data.ids }, ...scopeWhere },
    });

    if (op === 'delete') {
      await prisma.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
      return NextResponse.json({ ok: true, deleted: customers.length });
    }

    if (op === 'export') {
      const csv = toCsv(
        customers.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          email: c.email,
          phone: c.phone,
          gstin: c.gstin ?? '',
          city: c.city,
          state: c.state,
        })),
      );
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="customers.csv"',
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported bulk operation' }, { status: 400 });
  })(req, routeCtx);
}
