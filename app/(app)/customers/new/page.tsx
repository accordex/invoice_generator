'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';
import { customerSchema } from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api/client';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function NewCustomerPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: CustomerFormValues) => {
    setLoading(true);
    try {
      const customer = await apiFetch<{ id: string }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast({ title: 'Customer created' });
      router.push(`/customers/${customer.id}/edit`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to create customer',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Guarded action="CUSTOMER.CREATE">
      <PageHeader title="New Customer" description="Add a new customer to your directory" />
      <CustomerForm onSubmit={handleSubmit} onCancel={() => router.back()} loading={loading} />
    </Guarded>
  );
}
