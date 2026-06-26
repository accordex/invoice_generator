'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { formatCurrencyINR, formatDateIN } from '@/lib/format';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Guarded } from '@/components/privilege/Guarded';

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', 'detail', params.id],
    queryFn: async () => {
      const result = await apiFetch<{ data: Array<Record<string, unknown>> }>('/api/payments?pageSize=100');
      const payment = result.data.find((p) => p.id === params.id);
      if (!payment) throw new Error('Payment not found');
      return payment;
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!payments) return <div>Payment not found</div>;

  const invoice = payments.invoice as { id: string; invoiceNumber: string; customer: { name: string } };

  return (
    <Guarded action="PAYMENT.VIEW">
      <PageHeader title="Payment Details" />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{formatCurrencyINR(Number(payments.amount))}</CardTitle>
          <Badge variant="secondary">{String(payments.status)}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Invoice:</span>{' '}
            <Link href={`/invoices/${invoice.id}/preview`} className="text-primary hover:underline">
              {invoice.invoiceNumber}
            </Link>
          </p>
          <p><span className="text-muted-foreground">Customer:</span> {invoice.customer.name}</p>
          <p><span className="text-muted-foreground">Method:</span> {String(payments.method ?? '—')}</p>
          <p><span className="text-muted-foreground">Razorpay ID:</span> {String(payments.razorpayPaymentId)}</p>
          {payments.capturedAt ? (
            <p><span className="text-muted-foreground">Captured:</span> {formatDateIN(String(payments.capturedAt))}</p>
          ) : null}
        </CardContent>
      </Card>
    </Guarded>
  );
}
