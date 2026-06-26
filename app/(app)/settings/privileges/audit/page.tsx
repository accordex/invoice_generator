'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatDateIN } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Input } from '@/components/ui/input';
import { Guarded } from '@/components/privilege/Guarded';

interface AuditRow {
  id: string;
  action: string;
  actorId: string;
  actorEmail?: string;
  targetType?: string | null;
  targetId?: string | null;
  createdAt: string;
}

export default function PrivilegeAuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['privilege', 'audit', page, action],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (action) params.set('action', action);
      return apiFetch<{ data: AuditRow[]; meta: { page: number; totalPages: number; total: number; pageSize: number } }>(
        `/api/privilege/audit?${params}`,
      );
    },
  });

  const columns: ColumnDef<AuditRow>[] = [
    { key: 'date', header: 'When', cell: (r) => formatDateIN(r.createdAt) },
    { key: 'action', header: 'Action', cell: (r) => <code className="text-xs">{r.action}</code> },
    { key: 'actor', header: 'Actor', cell: (r) => r.actorEmail ?? r.actorId },
    { key: 'target', header: 'Target', cell: (r) => r.targetId ? `${r.targetType}:${r.targetId}` : '—' },
  ];

  return (
    <Guarded action="PRIVILEGE.MANAGE">
      <PageHeader title="Audit Log" description="Immutable privilege change history" />
      <div className="mb-4">
        <Input placeholder="Filter by action…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="max-w-sm" />
      </div>
      <DataTable columns={columns} data={data?.data ?? []} meta={data?.meta} loading={isLoading} onPageChange={setPage} getRowKey={(r) => r.id} />
    </Guarded>
  );
}
