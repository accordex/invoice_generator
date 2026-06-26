'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { customerSchema } from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api/client';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function EditCustomerPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customers', params.id],
    queryFn: () => apiFetch<CustomerFormValues & { id: string }>(`/api/customers/${params.id}`),
  });

  const handleSubmit = async (data: CustomerFormValues) => {
    setLoading(true);
    try {
      await apiFetch(`/api/customers/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      toast({ title: 'Customer updated' });
      router.refresh();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/customers/${params.id}`, { method: 'DELETE' });
      toast({ title: 'Customer deleted' });
      router.push('/customers');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Guarded action="CUSTOMER.EDIT">
      <PageHeader
        title="Edit Customer"
        description={customer?.name}
        actions={
          <PrivilegeButton code="BTN_CUSTOMER_DELETE" variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </PrivilegeButton>
        }
      />
      {customer && (
        <CustomerForm
          defaultValues={customer}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/customers')}
          loading={loading}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete customer?"
        description="This action cannot be undone."
        variant="destructive"
        confirmLabel="Delete"
        loading={loading}
        onConfirm={handleDelete}
      />
    </Guarded>
  );
}
