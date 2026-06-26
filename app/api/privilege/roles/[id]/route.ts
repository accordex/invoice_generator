import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (_req, _ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(role);
});

export const PATCH = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (req, ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const role = await prisma.role.update({ where: { id }, data: parsed.data });
  await logPrivilegeAudit({ actorUserId: ctx.userId, action: 'ROLE.UPDATE', affectedRoleId: id });
  return NextResponse.json(role);
});

export const DELETE = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (_req, ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 400 });
  }

  await prisma.role.delete({ where: { id } });
  await logPrivilegeAudit({ actorUserId: ctx.userId, action: 'ROLE.DELETE', affectedRoleId: id });
  return NextResponse.json({ ok: true });
});
