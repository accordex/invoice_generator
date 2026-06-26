'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PrivilegeColumn } from '@/components/privilege/PrivilegeColumn';
import { PrivilegeFilter } from '@/components/privilege/PrivilegeFilter';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Guarded } from '@/components/privilege/Guarded';

interface CustomerRow {
  id: string;
  name: string;
  type: string;
  email: string;
  phone: string;
  city: string;
  isActive: boolean;
}

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (search) params.set('search', search);
      return apiFetch<{ data: CustomerRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(
        `/api/customers?${params}`,
      );
    },
  });

  const columns: ColumnDef<CustomerRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <Link href={`/customers/${row.id}/edit`} className="font-medium text-primary hover:underline">
          <PrivilegeColumn code="COL_CUSTOMER_NAME" value={row.name}>{row.name}</PrivilegeColumn>
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => <PrivilegeColumn code="COL_CUSTOMER_TYPE" value={row.type}>{row.type}</PrivilegeColumn>,
    },
    {
      key: 'email',
      header: 'Email',
      cell: (row) => <PrivilegeColumn code="COL_CUSTOMER_EMAIL" value={row.email}>{row.email}</PrivilegeColumn>,
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (row) => <PrivilegeColumn code="COL_CUSTOMER_PHONE" value={row.phone}>{row.phone}</PrivilegeColumn>,
    },
    {
      key: 'city',
      header: 'City',
      cell: (row) => row.city,
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
    <Guarded module="CUSTOMERS" min="VIEW">
      <PageHeader
        title="Customers"
        description="Manage your customer directory"
        actions={
          <Guarded action="CUSTOMER.CREATE">
            <Button asChild>
              <Link href="/customers/new">
                <Plus className="mr-2 h-4 w-4" />
                New Customer
              </Link>
            </Button>
          </Guarded>
        }
      />

      <div className="mb-4">
        <PrivilegeFilter code="FILTER_CUSTOMER_SEARCH">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm"
          />
        </PrivilegeFilter>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        meta={data?.meta}
        loading={isLoading}
        onPageChange={setPage}
        getRowKey={(row) => row.id}
      />
    </Guarded>
  );
}
