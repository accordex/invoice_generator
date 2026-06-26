'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

interface RegistrySummary {
  levels: Array<{ level: string; count: number }>;
  product: { code: string; name: string };
}

export default function RegistryInspectorPage() {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['privilege', 'registry'],
    queryFn: () => apiFetch<RegistrySummary>('/api/privilege/registry'),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch('/api/privilege/registry/sync', { method: 'POST' }),
    onSuccess: () => {
      refetch();
      toast({ title: 'Registry synced from manifest' });
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Sync failed', description: err.message }),
  });

  return (
    <Guarded action="PRIVILEGE.MANAGE">
      <PageHeader
        title="Registry Inspector"
        description="Read-only view of the privilege manifest registry"
        actions={
          <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? 'Syncing…' : 'Sync Registry'}
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{data?.product.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Product code: {data?.product.code}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {(data?.levels ?? []).map((level) => (
              <Card key={level.level}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{level.level.replace(/_/g, ' ')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{level.count}</p>
                  <p className="text-xs text-muted-foreground">targets</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </Guarded>
  );
}
