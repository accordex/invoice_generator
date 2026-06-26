import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

const grantsSchema = z.object({
  grants: z.array(
    z.object({
      targetLevel: z.string().min(1),
      targetId: z.string().min(1),
      mode: z.string().min(1),
      maskPattern: z.string().optional().nullable(),
    }),
  ),
});

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (_req, _ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const grants = await prisma.rolePrivilegeGrant.findMany({
    where: { roleId: id },
    orderBy: [{ targetLevel: 'asc' }, { targetId: 'asc' }],
  });
  return NextResponse.json(grants);
});

export const PUT = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (req, ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const parsed = grantsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  for (const grant of parsed.data.grants) {
    await prisma.rolePrivilegeGrant.upsert({
      where: {
        roleId_targetLevel_targetId: {
          roleId: id,
          targetLevel: grant.targetLevel,
          targetId: grant.targetId,
        },
      },
      create: {
        roleId: id,
        targetLevel: grant.targetLevel,
        targetId: grant.targetId,
        mode: grant.mode,
        maskPattern: grant.maskPattern,
        createdBy: ctx.userId,
      },
      update: {
        mode: grant.mode,
        maskPattern: grant.maskPattern,
      },
    });

    await logPrivilegeAudit({
      actorUserId: ctx.userId,
      action: 'GRANT.UPSERT',
      affectedRoleId: id,
      targetLevel: grant.targetLevel,
      targetId: grant.targetId,
      newMode: grant.mode,
      newMask: grant.maskPattern ?? undefined,
    });
  }

  const grants = await prisma.rolePrivilegeGrant.findMany({ where: { roleId: id } });
  return NextResponse.json(grants);
});
