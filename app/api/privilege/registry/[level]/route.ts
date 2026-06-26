import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { listRegistryTargets } from '@/lib/privilege/registry-query';
import type { TargetLevel } from '@/lib/privilege/resolver';

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async (_req, _ctx, routeCtx) => {
  const level = routeCtx?.params?.level as TargetLevel;
  if (!level) return NextResponse.json({ error: 'Missing level' }, { status: 400 });
  const targets = await listRegistryTargets(level);
  return NextResponse.json(targets);
});
