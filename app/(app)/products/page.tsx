'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { formatCurrencyINR } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PrivilegeColumn } from '@/components/privilege/PrivilegeColumn';
import { PrivilegeFilter } from '@/components/privilege/PrivilegeFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Guarded } from '@/components/privilege/Guarded';

interface ProductRow {
  id: string;
  name: string;
  type: string;
  sku?: string | null;
  sellingPrice: number;
  taxRate: number;
  isActive: boolean;
}

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, type],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (type) params.set('type', type);
      return apiFetch<{ data: ProductRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(
        `/api/products?${params}`,
      );
    },
  });

  const columns: ColumnDef<ProductRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <Link href={`/products/${row.id}/edit`} className="font-medium text-primary hover:underline">
          <PrivilegeColumn code="COL_PRODUCT_NAME" value={row.name}>{row.name}</PrivilegeColumn>
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => <PrivilegeColumn code="COL_PRODUCT_TYPE" value={row.type}>{row.type}</PrivilegeColumn>,
    },
    {
      key: 'sku',
      header: 'SKU',
      cell: (row) => row.sku ?? '—',
    },
    {
      key: 'price',
      header: 'Price',
      cell: (row) => (
        <PrivilegeColumn code="COL_PRODUCT_PRICE" value={row.sellingPrice}>
          {formatCurrencyINR(Number(row.sellingPrice))}
        </PrivilegeColumn>
      ),
      className: 'text-right',
    },
    {
      key: 'tax',
      header: 'GST',
      cell: (row) => `${row.taxRate}%`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge variant={row.isActive ? 'success' : 'secondary'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ];

  return (
    <Guarded module="PRODUCTS" min="VIEW">
      <PageHeader
        title="Products & Services"
        actions={
          <Guarded action="PRODUCT.CREATE">
            <Button asChild>
              <Link href="/products/new"><Plus className="mr-2 h-4 w-4" />New Product</Link>
            </Button>
          </Guarded>
        }
      />

      <div className="mb-4">
        <PrivilegeFilter code="FILTER_PRODUCT_TYPE">
          <Select value={type || 'all'} onValueChange={(v) => { setType(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="PRODUCT">Product</SelectItem>
              <SelectItem value="SERVICE">Service</SelectItem>
            </SelectContent>
          </Select>
        </PrivilegeFilter>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} meta={data?.meta} loading={isLoading} onPageChange={setPage} getRowKey={(r) => r.id} />
    </Guarded>
  );
}
