import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { bulkIdsSchema } from '@/lib/validation/schemas';
import { toCsv } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export async function POST(req: NextRequest, routeCtx: { params: { op: string } }) {
  const op = routeCtx.params.op.toLowerCase();
  const bulkCode = `PRODUCT.BULK_${op.toUpperCase()}`;

  return withPrivilege({ bulkAction: bulkCode, applyRecordScope: 'PRODUCTS' }, async (innerReq, ctx) => {
    const body = await innerReq.json();
    const parsed = bulkIdsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
    }) as Prisma.ProductWhereInput;

    const products = await prisma.product.findMany({
      where: { id: { in: parsed.data.ids }, ...scopeWhere },
    });

    if (op === 'delete') {
      await prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
      return NextResponse.json({ ok: true, deleted: products.length });
    }

    if (op === 'export') {
      const csv = toCsv(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          sku: p.sku ?? '',
          unit: p.unit,
          sellingPrice: Number(p.sellingPrice),
          taxRate: p.taxRate,
        })),
      );
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="products.csv"',
        },
      });
    }

    if (op === 'import') {
      const rows = body.rows as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: 'rows array required for import' }, { status: 400 });
      }

      const created = await prisma.$transaction(
        rows.map((row) =>
          prisma.product.create({
            data: {
              name: String(row.name ?? ''),
              type: String(row.type ?? 'PRODUCT'),
              sku: row.sku ? String(row.sku) : null,
              description: row.description ? String(row.description) : null,
              hsnSac: row.hsnSac ? String(row.hsnSac) : null,
              unit: String(row.unit ?? 'Nos'),
              sellingPrice: Number(row.sellingPrice ?? 0),
              taxRate: Number(row.taxRate ?? 18),
              category: row.category ? String(row.category) : null,
              createdById: ctx.userId,
            },
          }),
        ),
      );

      return NextResponse.json({ ok: true, imported: created.length });
    }

    return NextResponse.json({ error: 'Unsupported bulk operation' }, { status: 400 });
  })(req, routeCtx);
}
