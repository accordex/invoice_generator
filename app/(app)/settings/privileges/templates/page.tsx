'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Guarded } from '@/components/privilege/Guarded';

interface TemplateRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isSystem: boolean;
  _count?: { items: number };
}

export default function PrivilegeTemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['privilege', 'templates'],
    queryFn: () => apiFetch<TemplateRow[]>('/api/privilege/templates'),
  });

  return (
    <Guarded action="PRIVILEGE.MANAGE">
      <PageHeader title="Privilege Templates" description="Pre-built permission bundles" />
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{t.name}</CardTitle>
                  <Badge variant={t.isSystem ? 'secondary' : 'outline'}>{t.isSystem ? 'System' : 'Custom'}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t.description ?? 'No description'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t._count?.items ?? 0} grants · {t.category ?? 'General'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Guarded>
  );
}
