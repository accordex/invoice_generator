'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';
import { createUserSchema } from '@/lib/validation/user';
import { apiFetch } from '@/lib/api/client';
import { UserForm } from '@/components/users/UserForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type CreateUserValues = z.infer<typeof createUserSchema>;

export default function NewUserPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: CreateUserValues) => {
    setLoading(true);
    try {
      const user = await apiFetch<{ id: string }>('/api/privilege/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast({ title: 'User created', description: 'The new user can sign in with their email and password.' });
      router.push(`/settings/users/${user.id}`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to create user',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Guarded action="USER.CREATE">
      <PageHeader title="Add user" description="Create a new account and assign a role" />
      <UserForm mode="create" onSubmit={handleSubmit} onCancel={() => router.back()} loading={loading} />
    </Guarded>
  );
}
