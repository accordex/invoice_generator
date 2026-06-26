'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  _count?: { grants: number; userRoles: number };
}

export default function RolesListPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['privilege', 'roles'],
    queryFn: () => apiFetch<RoleRow[]>('/api/privilege/roles'),
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch('/api/privilege/roles', {
      method: 'POST',
      body: JSON.stringify({ code, name }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privilege', 'roles'] });
      setCreateOpen(false);
      setName('');
      setCode('');
      toast({ title: 'Role created' });
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Failed', description: err.message }),
  });

  const columns: ColumnDef<RoleRow>[] = [
    {
      key: 'name',
      header: 'Role',
      cell: (row) => (
        <Link href={`/settings/privileges/roles/${row.id}`} className="font-medium text-primary hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: 'code', header: 'Code', cell: (row) => <code className="text-xs">{row.code}</code> },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => <Badge variant={row.isSystem ? 'secondary' : 'outline'}>{row.isSystem ? 'System' : 'Custom'}</Badge>,
    },
    {
      key: 'users',
      header: 'Users',
      cell: (row) => row._count?.userRoles ?? 0,
    },
    {
      key: 'grants',
      header: 'Grants',
      cell: (row) => row._count?.grants ?? 0,
    },
  ];

  return (
    <Guarded action="PRIVILEGE.MANAGE">
      <PageHeader
        title="Roles & Permissions"
        description="Manage role-based access control"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />New Role
          </Button>
        }
      />
      <DataTable columns={columns} data={data ?? []} loading={isLoading} getRowKey={(r) => r.id} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Role</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, '_'))} placeholder="CUSTOM_ROLE" />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Custom Role" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!code || !name || createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Guarded>
  );
}
