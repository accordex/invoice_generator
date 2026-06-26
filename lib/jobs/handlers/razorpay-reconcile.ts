import { prisma } from '@/lib/prisma';
import { getRazorpay } from '@/lib/razorpay/client';
import { mapRazorpayLinkStatus, dispatchRazorpayEvent } from '@/lib/razorpay/webhook';
import { syncInvoicePaymentStatus } from '@/lib/invoices/transition';

const TERMINAL_STATUSES = ['PAID', 'CANCELLED', 'EXPIRED'];

/**
 * Reconciles non-terminal payment links against Razorpay every two hours.
 */
export async function reconcileRazorpayPayments(): Promise<void> {
  const links = await prisma.paymentLink.findMany({
    where: {
      status: { notIn: TERMINAL_STATUSES },
    },
    take: 200,
    orderBy: { updatedAt: 'asc' },
  });

  for (const link of links) {
    try {
      const remote = (await getRazorpay().paymentLink.fetch(link.razorpayLinkId)) as {
        status?: string;
        id?: string;
      };
      const mapped = mapRazorpayLinkStatus(String(remote.status ?? 'created'));

      if (mapped !== link.status) {
        await prisma.paymentLink.update({
          where: { id: link.id },
          data: { status: mapped },
        });
      }

      if (mapped === 'PAID') {
        await dispatchRazorpayEvent({
          event: 'payment_link.paid',
          payload: {
            payment_link: { entity: remote as Record<string, unknown> },
          },
        });
      }

      await syncInvoicePaymentStatus(link.invoiceId);
    } catch (err) {
      console.error('razorpay:reconcile failed', {
        linkId: link.id,
        razorpayLinkId: link.razorpayLinkId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
