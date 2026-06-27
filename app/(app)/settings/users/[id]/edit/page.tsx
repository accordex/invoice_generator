'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { updateUserSchema } from '@/lib/validation/user';
import { apiFetch } from '@/lib/api/client';
import { UserForm } from '@/components/users/UserForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type UpdateUserValues = z.infer<typeof updateUserSchema>;

export default function EditUserPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ['privilege', 'users', params.id, 'edit'],
    queryFn: () =>
      apiFetch<{
        id: string;
        email: string;
        name?: string | null;
        isActive: boolean;
        isSuperAdmin: boolean;
        teamId?: string | null;
        branchId?: string | null;
        departmentId?: string | null;
        roleId?: string | null;
      }>(`/api/privilege/users/${params.id}`),
  });

  const handleSubmit = async (data: UpdateUserValues) => {
    setLoading(true);
    try {
      await apiFetch(`/api/privilege/users/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      toast({ title: 'User updated' });
      router.push(`/settings/users/${params.id}`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to update user',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!user) return <div>User not found</div>;
  if (user.isSuperAdmin) {
    return (
      <Guarded action="USER.VIEW">
        <PageHeader title="Super Admin" description="This system account cannot be edited here." />
      </Guarded>
    );
  }

  return (
    <Guarded action="USER.EDIT">
      <PageHeader title="Edit user" description={user.email} />
      <UserForm
        mode="edit"
        defaultValues={{
          name: user.name ?? '',
          email: user.email,
          roleId: user.roleId ?? '',
          teamId: user.teamId,
          branchId: user.branchId,
          departmentId: user.departmentId,
          isActive: user.isActive,
          password: '',
        }}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        loading={loading}
      />
    </Guarded>
  );
}
