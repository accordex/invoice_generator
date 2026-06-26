import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';

export const GET = withPrivilege({ action: 'USER.VIEW' }, async (_req, _ctx, routeCtx) => {
  const id = routeCtx?.params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const map = await buildPrivilegeMap(id);
  return NextResponse.json(map);
});
