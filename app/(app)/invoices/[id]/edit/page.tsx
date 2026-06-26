'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { invoiceSchema } from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api/client';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoices', params.id],
    queryFn: () => apiFetch<InvoiceFormValues & { id: string; lineItems: InvoiceFormValues['lineItems'] }>(`/api/invoices/${params.id}`),
  });

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: () => apiFetch<{ state: string }>('/api/company').catch(() => ({ state: 'Maharashtra' })),
  });

  const handleSubmit = async (data: InvoiceFormValues) => {
    setLoading(true);
    try {
      await apiFetch(`/api/invoices/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...data,
          invoiceDate: data.invoiceDate.toISOString(),
          dueDate: data.dueDate.toISOString(),
        }),
      });
      toast({ title: 'Invoice updated' });
      router.push(`/invoices/${params.id}/preview`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Update failed', description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/invoices/${params.id}`, { method: 'DELETE' });
      toast({ title: 'Invoice deleted' });
      router.push('/invoices');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Guarded action="INVOICE.EDIT">
      <PageHeader
        title="Edit Invoice"
        actions={
          <>
            <PrivilegeButton code="BTN_INVOICE_DOWNLOAD_PDF" variant="outline" onClick={() => router.push(`/invoices/${params.id}/preview`)}>
              Preview
            </PrivilegeButton>
            <PrivilegeButton code="BTN_INVOICE_DELETE" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </PrivilegeButton>
          </>
        }
      />
      {invoice && (
        <InvoiceForm
          defaultValues={{
            ...invoice,
            invoiceDate: new Date(invoice.invoiceDate as unknown as string),
            dueDate: new Date(invoice.dueDate as unknown as string),
            lineItems: invoice.lineItems.map((l) => ({
              ...l,
              quantity: Number(l.quantity),
              rate: Number(l.rate),
              discountPct: Number(l.discountPct),
            })),
          }}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/invoices')}
          loading={loading}
          companyState={company?.state}
        />
      )}
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete invoice?" variant="destructive" confirmLabel="Delete" loading={loading} onConfirm={handleDelete} />
    </Guarded>
  );
}
