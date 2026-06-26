import { NextRequest, NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { resolveOne } from '@/lib/privilege/resolver';
import { runReport } from '@/lib/reports';

export async function GET(req: NextRequest, routeCtx: { params: { code: string } }) {
  const code = routeCtx.params.code;
  const exportMode = req.nextUrl.searchParams.get('export') === 'true';

  return withPrivilege(
    { applyRecordScope: 'INVOICES' },
    async (_req, ctx) => {
      if (!ctx.isSuperAdmin) {
        const { mode } = await resolveOne(ctx.userId, 'REPORT', code);
        if (mode === 'HIDDEN' || mode === 'NO_ACCESS') {
          return NextResponse.json({ error: 'Forbidden', code }, { status: 403 });
        }
        if (exportMode && mode !== 'EXPORT' && mode !== 'EDIT' && mode !== 'VIEW') {
          return NextResponse.json({ error: 'Export not permitted' }, { status: 403 });
        }
      }

      try {
        const data = await runReport(code, ctx.recordScope);
        if (exportMode) {
          const json = JSON.stringify(data, null, 2);
          return new NextResponse(json, {
            headers: {
              'Content-Type': 'application/json',
              'Content-Disposition': `attachment; filename="${code}.json"`,
            },
          });
        }
        return NextResponse.json({ code, data });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Report failed' },
          { status: 400 },
        );
      }
    },
  )(req, routeCtx);
}
