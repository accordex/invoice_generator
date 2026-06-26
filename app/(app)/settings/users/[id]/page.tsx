'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatDateIN } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Guarded } from '@/components/privilege/Guarded';

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['privilege', 'users', params.id],
    queryFn: () => apiFetch<{
      id: string;
      email: string;
      name?: string | null;
      isActive: boolean;
      isSuperAdmin: boolean;
      createdAt: string;
      roles: Array<{ role: { name: string; code: string }; assignedAt: string }>;
      overrides: Array<{ targetLevel: string; targetId: string; mode: string; reason: string }>;
    }>(`/api/privilege/users/${params.id}`),
  });

  const { data: effective } = useQuery({
    queryKey: ['privilege', 'users', params.id, 'effective'],
    queryFn: () => apiFetch<Record<string, { mode: string }>>(`/api/privilege/users/${params.id}/effective`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!user) return <div>User not found</div>;

  return (
    <Guarded action="USER.VIEW">
      <PageHeader title={user.name ?? user.email} description={user.email} />

      <div className="mb-6 flex gap-2">
        <Badge variant={user.isActive ? 'success' : 'destructive'}>{user.isActive ? 'Active' : 'Inactive'}</Badge>
        {user.isSuperAdmin && <Badge>Super Admin</Badge>}
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
          <TabsTrigger value="effective">Effective Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Assigned Roles</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {user.roles.length === 0 ? (
                <p className="text-muted-foreground">No roles assigned</p>
              ) : (
                user.roles.map((r) => (
                  <div key={r.role.code} className="flex items-center justify-between border-b py-2 text-sm">
                    <span className="font-medium">{r.role.name}</span>
                    <span className="text-muted-foreground">Since {formatDateIN(r.assignedAt)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overrides" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Privilege Overrides</CardTitle></CardHeader>
            <CardContent>
              {user.overrides.length === 0 ? (
                <p className="text-muted-foreground">No overrides</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {user.overrides.map((o, i) => (
                    <li key={i} className="flex justify-between border-b py-2">
                      <code>{o.targetLevel}:{o.targetId}</code>
                      <Badge variant="outline">{o.mode}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="effective" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Effective Permissions</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2">Target</th>
                      <th className="pb-2">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(effective ?? {}).slice(0, 100).map(([key, val]) => (
                      <tr key={key} className="border-b">
                        <td className="py-1"><code className="text-xs">{key}</code></td>
                        <td className="py-1"><Badge variant="secondary">{val.mode}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Guarded>
  );
}
