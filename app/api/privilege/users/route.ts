import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { parsePagination, paginated } from '@/lib/api/pagination';
import { createUserSchema } from '@/lib/validation/user';
import { createUser } from '@/lib/users/service';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

export const GET = withPrivilege({ action: 'USER.LIST' }, async (req) => {
  const pagination = parsePagination(req);

  const [total, rows] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
        roles: { include: { role: { select: { name: true, code: true } } } },
      },
    }),
  ]);

  return NextResponse.json(paginated(rows, total, pagination));
});

/**
 * Creates a user with password and initial role assignment.
 */
export const POST = withPrivilege({ action: 'USER.CREATE' }, async (req, ctx) => {
  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(parsed.data, ctx.userId);
    await logPrivilegeAudit({
      actorUserId: ctx.userId,
      action: 'USER.CREATE',
      affectedUserId: user.id,
      metadata: { email: user.email, roleId: parsed.data.roleId },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create user';
    const status = message.includes('already exists') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
});
