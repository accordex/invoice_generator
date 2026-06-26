import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';
import { scrubRequest, scrubResponse } from '@/lib/privilege/scrub';
import { productSchema } from '@/lib/validation/schemas';
import { parsePagination, paginated } from '@/lib/api/pagination';
import { serializeDecimals } from '@/lib/api/serialize';
import type { Prisma } from '@prisma/client';

export const GET = withPrivilege(
  { action: 'PRODUCT.LIST', applyRecordScope: 'PRODUCTS' },
  async (req, ctx) => {
    const pagination = parsePagination(req);
    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
    }) as Prisma.ProductWhereInput;

    const search = req.nextUrl.searchParams.get('search');
    const where: Prisma.ProductWhereInput = {
      ...scopeWhere,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    const privilegeMap = await buildPrivilegeMap(ctx.userId);
    const data = rows.map((row) =>
      scrubResponse(serializeDecimals(row) as Record<string, unknown>, 'PRODUCT_FORM', privilegeMap),
    );

    return NextResponse.json(paginated(data, total, pagination));
  },
);

export const POST = withPrivilege({ action: 'PRODUCT.CREATE' }, async (req, ctx) => {
  const body = await req.json();
  const privilegeMap = await buildPrivilegeMap(ctx.userId);
  const scrubbed = scrubRequest(body, 'PRODUCT_FORM', privilegeMap);
  const parsed = productSchema.safeParse(scrubbed);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      ...parsed.data,
      createdById: ctx.userId,
    },
  });

  return NextResponse.json(
    scrubResponse(serializeDecimals(product) as Record<string, unknown>, 'PRODUCT_FORM', privilegeMap),
    { status: 201 },
  );
});
