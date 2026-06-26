'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { InvoicePreview } from '@/components/invoices/InvoicePreview';
import { PageHeader } from '@/components/shared/PageHeader';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { Button } from '@/components/ui/button';
import { Guarded } from '@/components/privilege/Guarded';

export default function InvoicePreviewPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoices', params.id, 'preview'],
    queryFn: () => apiFetch<Record<string, unknown>>(`/api/invoices/${params.id}`),
  });

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: () => apiFetch<Record<string, unknown>>('/api/company').catch(() => null),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!invoice) return <div>Invoice not found</div>;

  const normalized = {
    ...invoice,
    subtotal: Number(invoice.subtotal),
    totalDiscount: Number(invoice.totalDiscount),
    taxableAmount: Number(invoice.taxableAmount),
    cgst: Number(invoice.cgst),
    sgst: Number(invoice.sgst),
    igst: Number(invoice.igst),
    shippingCharges: Number(invoice.shippingCharges),
    roundOff: Number(invoice.roundOff),
    grandTotal: Number(invoice.grandTotal),
    lineItems: (invoice.lineItems as Array<Record<string, unknown>>).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      discountPct: Number(l.discountPct),
      taxPct: Number(l.taxPct),
      lineTotal: Number(l.lineTotal),
    })),
    customer: invoice.customer as { name: string; email?: string; gstin?: string | null },
  };

  return (
    <Guarded action="INVOICE.VIEW">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber as string}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/invoices/${params.id}/edit`)}>Edit</Button>
            <PrivilegeButton code="BTN_INVOICE_PRINT" variant="outline" onClick={() => window.print()}>
              Print
            </PrivilegeButton>
            <PrivilegeButton code="BTN_INVOICE_GENERATE_PAYMENT_LINK" onClick={async () => {
              await apiFetch(`/api/invoices/${params.id}/payment-link`, { method: 'POST' });
            }}>
              Payment Link
            </PrivilegeButton>
          </div>
        }
      />
      <InvoicePreview invoice={normalized as Parameters<typeof InvoicePreview>[0]['invoice']} company={company as Parameters<typeof InvoicePreview>[0]['company']} />
    </Guarded>
  );
}
