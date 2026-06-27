import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { updateUserSchema } from '@/lib/validation/user';
import { updateUser } from '@/lib/users/service';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

export const GET = withPrivilege({ action: 'USER.VIEW' }, async (_req, _ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      isSuperAdmin: true,
      teamId: true,
      branchId: true,
      departmentId: true,
      createdAt: true,
      roles: {
        include: { role: { select: { id: true, name: true, code: true } } },
      },
      overrides: {
        select: { targetLevel: true, targetId: true, mode: true, reason: true },
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...user,
    roleId: user.roles[0]?.role.id ?? null,
    roles: user.roles.map((r) => ({
      role: r.role,
      assignedAt: r.assignedAt,
    })),
  });
});

/**
 * Updates user profile, optional password, org fields, and role.
 */
export const PATCH = withPrivilege({ action: 'USER.EDIT' }, async (req, ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const user = await updateUser(id, parsed.data, ctx.userId);
    await logPrivilegeAudit({
      actorUserId: ctx.userId,
      action: 'USER.EDIT',
      affectedUserId: user.id,
      metadata: { email: user.email, roleId: parsed.data.roleId },
    });
    return NextResponse.json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user';
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
});
