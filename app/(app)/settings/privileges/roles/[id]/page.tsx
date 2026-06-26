'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { TargetLevel } from '@/lib/privilege/resolver';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

const TARGET_LEVELS: TargetLevel[] = [
  'MENU_ITEM', 'MODULE', 'FORM', 'TAB', 'SECTION', 'FIELD', 'BUTTON',
  'LIST_COLUMN', 'LIST_FILTER', 'BULK_ACTION', 'ACTION', 'STATUS_TRANSITION',
  'RECORD_SCOPE', 'REPORT', 'DASHBOARD_WIDGET',
];

const MODES_BY_LEVEL: Record<string, string[]> = {
  MENU_ITEM: ['HIDDEN', 'VISIBLE'],
  MODULE: ['NO_ACCESS', 'VIEW', 'EDIT'],
  FORM: ['NO_ACCESS', 'VIEW', 'EDIT'],
  TAB: ['HIDDEN', 'COLLAPSED', 'VIEW', 'EDIT'],
  SECTION: ['HIDDEN', 'COLLAPSED', 'VIEW', 'EDIT'],
  FIELD: ['HIDDEN', 'MASKED', 'VIEW', 'EDIT', 'REQUIRED', 'OPTIONAL'],
  BUTTON: ['HIDDEN', 'DISABLED', 'VISIBLE'],
  LIST_COLUMN: ['HIDDEN', 'MASKED', 'VIEW'],
  LIST_FILTER: ['HIDDEN', 'VISIBLE'],
  BULK_ACTION: ['DENY', 'ALLOW', 'ALLOW_WITH_APPROVAL'],
  ACTION: ['DENY', 'ALLOW', 'ALLOW_WITH_APPROVAL'],
  STATUS_TRANSITION: ['DENY', 'ALLOW', 'ALLOW_WITH_APPROVAL'],
  RECORD_SCOPE: ['OWN', 'TEAM', 'DEPARTMENT', 'BRANCH', 'ALL'],
  REPORT: ['HIDDEN', 'VIEW', 'EXPORT'],
  DASHBOARD_WIDGET: ['HIDDEN', 'VISIBLE'],
};

interface RegistryTarget {
  level: string;
  targetId: string;
  name: string;
}

interface GrantRow {
  targetLevel: string;
  targetId: string;
  mode: string;
  maskPattern?: string | null;
}

export default function RoleEditorPage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TargetLevel>('MODULE');
  const [search, setSearch] = useState('');
  const [localGrants, setLocalGrants] = useState<Record<string, string>>({});

  const { data: role } = useQuery({
    queryKey: ['privilege', 'roles', params.id],
    queryFn: () => apiFetch<{ id: string; name: string; code: string }>(`/api/privilege/roles/${params.id}`),
  });

  const { data: registry } = useQuery({
    queryKey: ['privilege', 'registry', activeTab],
    queryFn: () => apiFetch<RegistryTarget[]>(`/api/privilege/registry/${activeTab}`),
  });

  const { data: grants } = useQuery({
    queryKey: ['privilege', 'roles', params.id, 'grants'],
    queryFn: () => apiFetch<GrantRow[]>(`/api/privilege/roles/${params.id}/grants`),
  });

  const getMode = (targetId: string) => {
    const key = `${activeTab}:${targetId}`;
    if (localGrants[key] !== undefined) return localGrants[key];
    const existing = grants?.find((g) => g.targetLevel === activeTab && g.targetId === targetId);
    return existing?.mode ?? 'HIDDEN';
  };

  const setMode = (targetId: string, mode: string) => {
    setLocalGrants((prev) => ({ ...prev, [`${activeTab}:${targetId}`]: mode }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = Object.entries(localGrants).map(([key, mode]) => {
        const [targetLevel, targetId] = key.split(':');
        return { targetLevel, targetId, mode };
      });
      return apiFetch(`/api/privilege/roles/${params.id}/grants`, {
        method: 'PUT',
        body: JSON.stringify({ grants: payload }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privilege', 'roles', params.id, 'grants'] });
      setLocalGrants({});
      toast({ title: 'Grants saved' });
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Save failed', description: err.message }),
  });

  const filtered = (registry ?? []).filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.targetId.toLowerCase().includes(search.toLowerCase()),
  );

  const modes = MODES_BY_LEVEL[activeTab] ?? ['HIDDEN', 'VISIBLE'];

  return (
    <Guarded action="PRIVILEGE.MANAGE">
      <PageHeader
        title={role?.name ?? 'Role Editor'}
        description={`Permission matrix for ${role?.code ?? ''}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocalGrants({})}>Discard</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || Object.keys(localGrants).length === 0}>
              Save Changes
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TargetLevel)}>
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          {TARGET_LEVELS.map((level) => (
            <TabsTrigger key={level} value={level} className="text-xs">
              {level.replace('_', ' ')}
            </TabsTrigger>
          ))}
        </TabsList>

        {TARGET_LEVELS.map((level) => (
          <TabsContent key={level} value={level}>
            <div className="mb-4 flex gap-4">
              <Input
                placeholder="Search targets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Select onValueChange={(mode) => {
                filtered.forEach((t) => setMode(t.targetId, mode));
              }}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Set all to…" /></SelectTrigger>
                <SelectContent>
                  {modes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-48">Mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((target) => (
                    <TableRow key={target.targetId}>
                      <TableCell>{target.name}</TableCell>
                      <TableCell><code className="text-xs">{target.targetId}</code></TableCell>
                      <TableCell>
                        <Select value={getMode(target.targetId)} onValueChange={(m) => setMode(target.targetId, m)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {modes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Guarded>
  );
}
