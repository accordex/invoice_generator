import { prisma } from '@/lib/prisma';

/**
 * Applies a status transition to an invoice after validating the transition definition.
 */
export async function applyInvoiceTransition(invoiceId: string, transitionCode: string) {
  const transition = await prisma.statusTransitionDef.findFirst({
    where: { code: transitionCode },
  });
  if (!transition) {
    throw new Error(`Unknown transition: ${transitionCode}`);
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  if (invoice.status !== transition.fromStatus) {
    throw new Error(`Cannot apply ${transitionCode} from status ${invoice.status}`);
  }

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: transition.toStatus },
    include: { lineItems: true, customer: true },
  });
}

/**
 * Recalculates invoice payment status from captured payments.
 */
export async function syncInvoicePaymentStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;

  const capturedTotal = invoice.payments
    .filter((p) => p.status === 'CAPTURED')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const grandTotal = Number(invoice.grandTotal);
  let status = invoice.status;

  if (capturedTotal >= grandTotal) {
    status = 'PAID';
  } else if (capturedTotal > 0 && invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT') {
    status = 'PARTIALLY_PAID';
  }

  if (status !== invoice.status) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  }
}
