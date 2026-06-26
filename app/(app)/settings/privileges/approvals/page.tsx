'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatDateIN } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

interface ApprovalRow {
  id: string;
  targetLevel: string;
  targetId: string;
  status: string;
  requestedAt: string;
  requester: { name?: string | null; email: string };
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['privilege', 'approvals', page],
    queryFn: () => apiFetch<{ data: ApprovalRow[]; meta: { page: number; totalPages: number; total: number; pageSize: number } }>(
      `/api/privilege/approvals?status=PENDING&page=${page}`,
    ),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/privilege/approvals/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privilege', 'approvals'] });
      toast({ title: 'Approved' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/privilege/approvals/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privilege', 'approvals'] });
      toast({ title: 'Rejected' });
    },
  });

  const columns: ColumnDef<ApprovalRow>[] = [
    { key: 'requester', header: 'Requester', cell: (r) => r.requester.name ?? r.requester.email },
    { key: 'target', header: 'Target', cell: (r) => <code className="text-xs">{r.targetLevel}:{r.targetId}</code> },
    { key: 'date', header: 'Requested', cell: (r) => formatDateIN(r.requestedAt) },
    { key: 'status', header: 'Status', cell: (r) => <Badge variant="warning">{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) => (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => approveMutation.mutate(r.id)}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(r.id)}>Reject</Button>
        </div>
      ),
    },
  ];

  return (
    <Guarded action="PRIVILEGE.MANAGE">
      <PageHeader title="Approval Queue" description="Pending privilege approval requests" />
      <DataTable columns={columns} data={data?.data ?? []} meta={data?.meta} loading={isLoading} onPageChange={setPage} getRowKey={(r) => r.id} />
    </Guarded>
  );
}
