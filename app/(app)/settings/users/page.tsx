'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { formatDateIN } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Guarded } from '@/components/privilege/Guarded';

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  roles?: Array<{ role: { name: string; code: string } }>;
}

export default function UsersPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['privilege', 'users', page],
    queryFn: () => apiFetch<{ data: UserRow[]; meta: { page: number; totalPages: number; total: number; pageSize: number } }>(
      `/api/privilege/users?page=${page}`,
    ),
  });

  const columns: ColumnDef<UserRow>[] = [
    {
      key: 'name',
      header: 'User',
      cell: (row) => (
        <Link href={`/settings/users/${row.id}`} className="font-medium text-primary hover:underline">
          {row.name ?? row.email}
        </Link>
      ),
    },
    { key: 'email', header: 'Email', cell: (row) => row.email },
    {
      key: 'roles',
      header: 'Roles',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.isSuperAdmin && <Badge>Super Admin</Badge>}
          {row.roles?.map((r) => (
            <Badge key={r.role.code} variant="secondary">{r.role.name}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <Badge variant={row.isActive ? 'success' : 'destructive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    { key: 'joined', header: 'Joined', cell: (row) => formatDateIN(row.createdAt) },
  ];

  return (
    <Guarded action="USER.LIST">
      <PageHeader
        title="Users"
        description="Manage user accounts and role assignments"
        actions={
          <Guarded action="USER.CREATE">
            <Button asChild>
              <Link href="/settings/users/new">
                <Plus className="mr-2 h-4 w-4" />
                Add user
              </Link>
            </Button>
          </Guarded>
        }
      />
      <DataTable columns={columns} data={data?.data ?? []} meta={data?.meta} loading={isLoading} onPageChange={setPage} getRowKey={(r) => r.id} />
    </Guarded>
  );
}
