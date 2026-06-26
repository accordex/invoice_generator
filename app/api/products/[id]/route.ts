import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';
import { scrubRequest, scrubResponse } from '@/lib/privilege/scrub';
import { productSchema } from '@/lib/validation/schemas';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

import type { PrivilegedContext } from '@/lib/privilege/withPrivilege';

function productScopeWhere(ctx: PrivilegedContext) {
  return buildScopeWhere(ctx.recordScope!, { ownerField: 'createdById' }) as Prisma.ProductWhereInput;
}

export const GET = withPrivilege(
  { action: 'PRODUCT.VIEW', applyRecordScope: 'PRODUCTS' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const product = await prisma.product.findFirst({
      where: { id, ...productScopeWhere(ctx) },
    });
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const privilegeMap = await buildPrivilegeMap(ctx.userId);
    return NextResponse.json(
      scrubResponse(serializeDecimals(product) as Record<string, unknown>, 'PRODUCT_FORM', privilegeMap),
    );
  },
);

export const PATCH = withPrivilege(
  { action: 'PRODUCT.EDIT', applyRecordScope: 'PRODUCTS' },
  async (req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.product.findFirst({
      where: { id, ...productScopeWhere(ctx) },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const privilegeMap = await buildPrivilegeMap(ctx.userId);
    const scrubbed = scrubRequest(body, 'PRODUCT_FORM', privilegeMap);
    const parsed = productSchema.partial().safeParse(scrubbed);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const product = await prisma.product.update({ where: { id }, data: parsed.data });
    return NextResponse.json(
      scrubResponse(serializeDecimals(product) as Record<string, unknown>, 'PRODUCT_FORM', privilegeMap),
    );
  },
);

export const DELETE = withPrivilege(
  { action: 'PRODUCT.DELETE', applyRecordScope: 'PRODUCTS' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.product.findFirst({
      where: { id, ...productScopeWhere(ctx) },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
