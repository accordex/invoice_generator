import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

export const POST = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (req, ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === 'string' ? body.note : undefined;

  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request || request.status !== 'PENDING') {
    return NextResponse.json({ error: 'Request not found or already resolved' }, { status: 404 });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status: 'REJECTED', approverId: ctx.userId, approverNote: note, resolvedAt: new Date() },
  });

  await logPrivilegeAudit({
    actorUserId: ctx.userId,
    action: 'APPROVAL.REJECT',
    affectedUserId: request.requesterId,
    targetLevel: request.targetLevel,
    targetId: request.targetId,
    metadata: { approvalId: id },
  });

  return NextResponse.json(updated);
});
