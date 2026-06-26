'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatCurrencyINR, formatDateIN } from '@/lib/format';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { PrivilegeColumn } from '@/components/privilege/PrivilegeColumn';
import { PrivilegeFilter } from '@/components/privilege/PrivilegeFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  method?: string | null;
  capturedAt?: string | null;
  invoice: { id: string; invoiceNumber: string; customer: { name: string } };
}

/**
 * Paginated payment list with status filter.
 */
export function PaymentList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, status],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (status) params.set('status', status);
      return apiFetch<{ data: PaymentRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(
        `/api/payments?${params}`,
      );
    },
  });

  const columns: ColumnDef<PaymentRow>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      cell: (row) => (
        <Link href={`/payments/${row.id}`} className="font-medium text-primary hover:underline">
          {row.invoice.invoiceNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => row.invoice.customer.name,
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (row) => (
        <PrivilegeColumn code="COL_PAYMENT_AMOUNT" value={row.amount}>
          {formatCurrencyINR(Number(row.amount))}
        </PrivilegeColumn>
      ),
      className: 'text-right',
    },
    {
      key: 'method',
      header: 'Method',
      cell: (row) => row.method ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <Badge variant="secondary">{row.status}</Badge>,
    },
    {
      key: 'capturedAt',
      header: 'Captured',
      cell: (row) => (row.capturedAt ? formatDateIN(row.capturedAt) : '—'),
    },
  ];

  return (
    <div className="space-y-4">
      <PrivilegeFilter code="FILTER_PAYMENT_STATUS">
        <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="captured">Captured</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </PrivilegeFilter>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        meta={data?.meta}
        loading={isLoading}
        onPageChange={setPage}
        getRowKey={(row) => row.id}
        emptyMessage="No payments recorded yet."
      />
    </div>
  );
}
