'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { invoiceSchema } from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api/client';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function NewInvoicePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: () => apiFetch<{ state: string }>('/api/company').catch(() => ({ state: 'Maharashtra' })),
  });

  const handleSubmit = async (data: InvoiceFormValues) => {
    setLoading(true);
    try {
      const invoice = await apiFetch<{ id: string }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          invoiceDate: data.invoiceDate.toISOString(),
          dueDate: data.dueDate.toISOString(),
        }),
      });
      toast({ title: 'Invoice created' });
      router.push(`/invoices/${invoice.id}/preview`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed', description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Guarded action="INVOICE.CREATE">
      <PageHeader title="New Invoice" />
      <InvoiceForm onSubmit={handleSubmit} onCancel={() => router.back()} loading={loading} companyState={company?.state} />
    </Guarded>
  );
}
