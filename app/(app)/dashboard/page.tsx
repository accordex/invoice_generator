'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatCurrencyINR, formatDateIN } from '@/lib/format';
import { useWidgetMode } from '@/lib/privilege/usePrivilege';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Guarded } from '@/components/privilege/Guarded';

function WidgetCard({
  code,
  title,
  children,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
}) {
  const mode = useWidgetMode(code);
  if (mode === 'HIDDEN') return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Dashboard with privilege-gated widgets from the widgets API.
 */
export default function DashboardPage() {
  const { data: widgets, isLoading } = useQuery({
    queryKey: ['dashboard', 'widgets'],
    queryFn: () => apiFetch<Record<string, unknown>>('/api/dashboard/widgets'),
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <Guarded module="INVOICES" min="VIEW">
      <PageHeader title="Dashboard" description="Overview of your invoicing activity" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WidgetCard code="WIDGET_REVENUE_MTD" title="Revenue (MTD)">
          <p className="text-2xl font-bold">
            {formatCurrencyINR(Number((widgets?.WIDGET_REVENUE_MTD as { amount?: number })?.amount ?? 0))}
          </p>
        </WidgetCard>
        <WidgetCard code="WIDGET_REVENUE_YTD" title="Revenue (YTD)">
          <p className="text-2xl font-bold">
            {formatCurrencyINR(Number((widgets?.WIDGET_REVENUE_YTD as { amount?: number })?.amount ?? 0))}
          </p>
        </WidgetCard>
        <WidgetCard code="WIDGET_OUTSTANDING" title="Outstanding">
          <p className="text-2xl font-bold text-amber-600">
            {formatCurrencyINR(Number((widgets?.WIDGET_OUTSTANDING as { amount?: number })?.amount ?? 0))}
          </p>
        </WidgetCard>
        <WidgetCard code="WIDGET_OVERDUE_COUNT" title="Overdue Invoices">
          <p className="text-2xl font-bold text-destructive">
            {(widgets?.WIDGET_OVERDUE_COUNT as { count?: number })?.count ?? 0}
          </p>
        </WidgetCard>
        <WidgetCard code="WIDGET_TAX_COLLECTED_MTD" title="Tax Collected (MTD)">
          <p className="text-2xl font-bold">
            {formatCurrencyINR(Number((widgets?.WIDGET_TAX_COLLECTED_MTD as { total?: number })?.total ?? 0))}
          </p>
        </WidgetCard>
        <WidgetCard code="WIDGET_PENDING_APPROVALS" title="Pending Approvals">
          <p className="text-2xl font-bold">{Number(widgets?.WIDGET_PENDING_APPROVALS ?? 0)}</p>
        </WidgetCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <WidgetCard code="WIDGET_RECENT_INVOICES" title="Recent Invoices">
          <ul className="space-y-2">
            {((widgets?.WIDGET_RECENT_INVOICES as Array<Record<string, unknown>>) ?? []).map((inv) => (
              <li key={String(inv.id)} className="flex items-center justify-between text-sm">
                <Link href={`/invoices/${inv.id}/preview`} className="font-medium text-primary hover:underline">
                  {String(inv.invoiceNumber)}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{String(inv.status)}</Badge>
                  <span>{formatCurrencyINR(Number(inv.grandTotal))}</span>
                </div>
              </li>
            ))}
          </ul>
        </WidgetCard>

        <WidgetCard code="WIDGET_TOP_CUSTOMERS" title="Top Customers">
          <ul className="space-y-2">
            {((widgets?.WIDGET_TOP_CUSTOMERS as Array<{ customerName?: string; revenue?: number }>) ?? []).map(
              (c, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{c.customerName}</span>
                  <span className="font-medium">{formatCurrencyINR(Number(c.revenue ?? 0))}</span>
                </li>
              ),
            )}
          </ul>
        </WidgetCard>
      </div>
    </Guarded>
  );
}
