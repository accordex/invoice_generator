import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

const createRoleSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async () => {
  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { grants: true, userRoles: true } } },
  });
  return NextResponse.json(roles);
});

export const POST = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (req, ctx) => {
  const body = await req.json();
  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.role.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return NextResponse.json({ error: 'Role code already exists' }, { status: 409 });
  }

  const role = await prisma.role.create({ data: parsed.data });
  await logPrivilegeAudit({
    actorUserId: ctx.userId,
    action: 'ROLE.CREATE',
    affectedRoleId: role.id,
    metadata: { code: role.code },
  });

  return NextResponse.json(role, { status: 201 });
});
