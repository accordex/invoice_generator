'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { formatCurrencyINR, formatDateIN } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PrivilegeColumn } from '@/components/privilege/PrivilegeColumn';
import { PrivilegeFilter } from '@/components/privilege/PrivilegeFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Guarded } from '@/components/privilege/Guarded';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  grandTotal: number;
  customer?: { name: string };
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'destructive',
};

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, status],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (status) params.set('status', status);
      return apiFetch<{ data: InvoiceRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(
        `/api/invoices?${params}`,
      );
    },
  });

  const columns: ColumnDef<InvoiceRow>[] = [
    {
      key: 'number',
      header: 'Invoice #',
      cell: (row) => (
        <Link href={`/invoices/${row.id}/preview`} className="font-medium text-primary hover:underline">
          <PrivilegeColumn code="COL_INVOICE_NUMBER" value={row.invoiceNumber}>{row.invoiceNumber}</PrivilegeColumn>
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <PrivilegeColumn code="COL_INVOICE_CUSTOMER" value={row.customer?.name}>
          {row.customer?.name ?? '—'}
        </PrivilegeColumn>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (row) => formatDateIN(row.invoiceDate),
    },
    {
      key: 'due',
      header: 'Due',
      cell: (row) => formatDateIN(row.dueDate),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (row) => (
        <PrivilegeColumn code="COL_INVOICE_AMOUNT" value={row.grandTotal}>
          {formatCurrencyINR(Number(row.grandTotal))}
        </PrivilegeColumn>
      ),
      className: 'text-right',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Link href={`/invoices/${row.id}/edit`} className="text-sm text-muted-foreground hover:text-primary">
          Edit
        </Link>
      ),
    },
  ];

  return (
    <Guarded module="INVOICES" min="VIEW">
      <PageHeader
        title="Invoices"
        actions={
          <Guarded action="INVOICE.CREATE">
            <Button asChild>
              <Link href="/invoices/new"><Plus className="mr-2 h-4 w-4" />New Invoice</Link>
            </Button>
          </Guarded>
        }
      />

      <div className="mb-4">
        <PrivilegeFilter code="FILTER_INVOICE_STATUS">
          <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'].map((s) => (
                <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeFilter>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} meta={data?.meta} loading={isLoading} onPageChange={setPage} getRowKey={(r) => r.id} />
    </Guarded>
  );
}
