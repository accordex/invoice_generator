import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { getDashboardWidgets } from '@/lib/dashboard/widgets';

export const GET = withPrivilege(
  { module: { code: 'INVOICES', min: 'VIEW' }, applyRecordScope: 'INVOICES' },
  async (_req, ctx) => {
    const widgets = await getDashboardWidgets(ctx.userId, ctx.isSuperAdmin, ctx.recordScope);
    return NextResponse.json(widgets);
  },
);
