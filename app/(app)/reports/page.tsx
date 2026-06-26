'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatCurrencyINR } from '@/lib/format';
import { invoiceManifest } from '@/lib/privilege/manifest';
import { useReportMode } from '@/lib/privilege/usePrivilege';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Guarded } from '@/components/privilege/Guarded';

function ReportCard({ code, name, description }: { code: string; name: string; description?: string }) {
  const mode = useReportMode(code);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const isVisible = mode !== 'HIDDEN' && mode !== 'NO_ACCESS';

  const { data, isLoading } = useQuery({
    queryKey: ['reports', code, page],
    queryFn: () => apiFetch<{ code: string; data: unknown }>(`/api/reports/${code}`),
    enabled: isVisible && expanded,
  });

  if (!isVisible) return null;

  const rows = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
  const columns: ColumnDef<Record<string, unknown>>[] = rows.length > 0
    ? Object.keys(rows[0] as object).map((key) => ({
        key,
        header: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        cell: (row) => {
          const val = row[key];
          if (typeof val === 'number' && (key.includes('amount') || key.includes('Total') || key.includes('revenue'))) {
            return formatCurrencyINR(val);
          }
          return String(val ?? '—');
        },
      }))
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{name}</CardTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide' : 'Run'}
          </Button>
          {(mode === 'EXPORT' || mode === 'EDIT') && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/reports/${code}?export=true`} download>Export</a>
            </Button>
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Running report…</p>
          ) : Array.isArray(data?.data) ? (
            <DataTable columns={columns} data={rows as Record<string, unknown>[]} onPageChange={setPage} getRowKey={(row) => String(row.id ?? JSON.stringify(row))} />
          ) : (
            <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(data?.data, null, 2)}
            </pre>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const reports = invoiceManifest.reports ?? [];

  return (
    <Guarded menu="NAV_REPORTS">
      <PageHeader title="Reports" description="Business intelligence and compliance reports" />
      <div className="grid gap-4">
        {reports.map((r) => (
          <ReportCard key={r.code} code={r.code} name={r.name} description={r.description} />
        ))}
      </div>
    </Guarded>
  );
}
