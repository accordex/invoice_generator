import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/privilege/withPrivilege';
import { buildPrivilegeMap } from '@/lib/privilege/resolver';

export const GET = withAuth(async (_req, ctx) => {
  const map = await buildPrivilegeMap(ctx.userId);
  return NextResponse.json(map);
});
