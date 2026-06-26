import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { syncManifestToRegistry } from '@/lib/privilege/registry-sync';
import { logPrivilegeAudit } from '@/lib/privilege/audit';

export const POST = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (_req, ctx) => {
  const result = await syncManifestToRegistry();
  await logPrivilegeAudit({
    actorUserId: ctx.userId,
    action: 'REGISTRY.SYNC',
    metadata: result as unknown as Record<string, number>,
  });
  return NextResponse.json(result);
});
