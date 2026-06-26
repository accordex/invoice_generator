import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';
import { scrubRequest, scrubResponse } from '@/lib/privilege/scrub';
import { companySchema } from '@/lib/validation/schemas';
import { serializeDecimals } from '@/lib/api/serialize';

export const GET = withPrivilege({ action: 'COMPANY.VIEW' }, async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    return NextResponse.json({ error: 'Company profile not configured' }, { status: 404 });
  }
  return NextResponse.json(serializeDecimals(company));
});

export const PATCH = withPrivilege({ action: 'COMPANY.EDIT' }, async (req, ctx) => {
  const body = await req.json();
  const privilegeMap = await buildPrivilegeMap(ctx.userId);
  const scrubbed = scrubRequest(body, 'COMPANY_PROFILE_FORM', privilegeMap);
  const parsed = companySchema.safeParse(scrubbed);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.company.findFirst();
  const company = existing
    ? await prisma.company.update({ where: { id: existing.id }, data: parsed.data })
    : await prisma.company.create({ data: parsed.data });

  return NextResponse.json(
    scrubResponse(serializeDecimals(company) as Record<string, unknown>, 'COMPANY_PROFILE_FORM', privilegeMap),
  );
});
