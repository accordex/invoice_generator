'use client';

import { PageHeader } from '@/components/shared/PageHeader';
import { PaymentList } from '@/components/payments/PaymentList';
import { Guarded } from '@/components/privilege/Guarded';

export default function PaymentsPage() {
  return (
    <Guarded menu="NAV_PAYMENTS">
      <PageHeader title="Payments" description="Razorpay payment records linked to invoices" />
      <PaymentList />
    </Guarded>
  );
}
