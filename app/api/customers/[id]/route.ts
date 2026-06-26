import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';
import { scrubRequest, scrubResponse } from '@/lib/privilege/scrub';
import { customerSchema, customerUpdateSchema } from '@/lib/validation/schemas';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

import type { PrivilegedContext } from '@/lib/privilege/withPrivilege';

function customerScopeWhere(ctx: PrivilegedContext) {
  return buildScopeWhere(ctx.recordScope!, {
    ownerField: 'createdById',
    teamField: 'teamId',
    branchField: 'branchId',
    departmentField: 'departmentId',
  }) as Prisma.CustomerWhereInput;
}

export const GET = withPrivilege(
  { action: 'CUSTOMER.VIEW', applyRecordScope: 'CUSTOMERS' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const customer = await prisma.customer.findFirst({
      where: { id, ...customerScopeWhere(ctx) },
    });
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const privilegeMap = await buildPrivilegeMap(ctx.userId);
    return NextResponse.json(
      scrubResponse(serializeDecimals(customer) as Record<string, unknown>, 'CUSTOMER_FORM', privilegeMap),
    );
  },
);

export const PATCH = withPrivilege(
  { action: 'CUSTOMER.EDIT', applyRecordScope: 'CUSTOMERS' },
  async (req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.customer.findFirst({
      where: { id, ...customerScopeWhere(ctx) },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const privilegeMap = await buildPrivilegeMap(ctx.userId);
    const scrubbed = scrubRequest(body, 'CUSTOMER_FORM', privilegeMap);
    const parsed = customerUpdateSchema.safeParse(scrubbed);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const customer = await prisma.customer.update({ where: { id }, data: parsed.data });
    return NextResponse.json(
      scrubResponse(serializeDecimals(customer) as Record<string, unknown>, 'CUSTOMER_FORM', privilegeMap),
    );
  },
);

export const DELETE = withPrivilege(
  { action: 'CUSTOMER.DELETE', applyRecordScope: 'CUSTOMERS' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.customer.findFirst({
      where: { id, ...customerScopeWhere(ctx) },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
