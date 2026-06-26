import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

export const POST = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (_req, ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request || request.status !== 'PENDING') {
    return NextResponse.json({ error: 'Request not found or already resolved' }, { status: 404 });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status: 'APPROVED', approverId: ctx.userId, resolvedAt: new Date() },
  });

  await logPrivilegeAudit({
    actorUserId: ctx.userId,
    action: 'APPROVAL.APPROVE',
    affectedUserId: request.requesterId,
    targetLevel: request.targetLevel,
    targetId: request.targetId,
    metadata: { approvalId: id },
  });

  return NextResponse.json(updated);
});
