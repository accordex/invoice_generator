import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';
import { scrubRequest, scrubResponse } from '@/lib/privilege/scrub';
import { customerSchema } from '@/lib/validation/schemas';
import { parsePagination, paginated } from '@/lib/api/pagination';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export const GET = withPrivilege(
  { action: 'CUSTOMER.LIST', applyRecordScope: 'CUSTOMERS' },
  async (req, ctx) => {
    const pagination = parsePagination(req);
    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
      teamField: 'teamId',
      branchField: 'branchId',
      departmentField: 'departmentId',
    }) as Prisma.CustomerWhereInput;

    const search = req.nextUrl.searchParams.get('search');
    const where: Prisma.CustomerWhereInput = {
      ...scopeWhere,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    const privilegeMap = await buildPrivilegeMap(ctx.userId);
    const data = rows.map((row) =>
      scrubResponse(serializeDecimals(row) as Record<string, unknown>, 'CUSTOMER_FORM', privilegeMap),
    );

    return NextResponse.json(paginated(data, total, pagination));
  },
);

export const POST = withPrivilege({ action: 'CUSTOMER.CREATE' }, async (req, ctx) => {
  const body = await req.json();
  const privilegeMap = await buildPrivilegeMap(ctx.userId);
  const scrubbed = scrubRequest(body, 'CUSTOMER_FORM', privilegeMap);
  const parsed = customerSchema.safeParse(scrubbed);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: {
      ...parsed.data,
      createdById: ctx.userId,
      teamId: ctx.teamId,
      branchId: ctx.branchId,
      departmentId: ctx.departmentId,
    },
  });

  return NextResponse.json(
    scrubResponse(serializeDecimals(customer) as Record<string, unknown>, 'CUSTOMER_FORM', privilegeMap),
    { status: 201 },
  );
});
