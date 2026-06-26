import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { applyInvoiceTransition, syncInvoicePaymentStatus } from '@/lib/invoices/transition';

interface RazorpayEvent {
  event: string;
  payload?: {
    payment_link?: { entity: Record<string, unknown> };
    payment?: { entity: Record<string, unknown> };
    refund?: { entity: Record<string, unknown> };
  };
}

function entityAmountPaise(entity: Record<string, unknown>): number {
  return Number(entity.amount ?? entity.amount_paid ?? 0);
}

function paiseToDecimal(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Handles Razorpay `payment_link.paid` webhook events.
 */
export async function handlePaymentLinkPaid(event: RazorpayEvent) {
  const entity = event.payload?.payment_link?.entity;
  if (!entity) return;

  const linkId = String(entity.id);
  const paymentLink = await prisma.paymentLink.findUnique({ where: { razorpayLinkId: linkId } });
  if (!paymentLink) return;

  await prisma.paymentLink.update({
    where: { id: paymentLink.id },
    data: { status: 'PAID' },
  });

  const paymentEntity = event.payload?.payment?.entity;
  if (paymentEntity?.id) {
    await upsertPaymentFromEntity(paymentLink.invoiceId, paymentLink.id, paymentEntity, 'CAPTURED');
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: paymentLink.invoiceId } });
  if (invoice?.status === 'SENT' || invoice?.status === 'PARTIALLY_PAID') {
    await applyInvoiceTransition(paymentLink.invoiceId, 'INVOICE.SENT_TO_PAID').catch(async () => {
      await syncInvoicePaymentStatus(paymentLink.invoiceId);
    });
  } else {
    await syncInvoicePaymentStatus(paymentLink.invoiceId);
  }
}

/**
 * Handles Razorpay `payment_link.cancelled` webhook events.
 */
export async function handlePaymentLinkCancelled(event: RazorpayEvent) {
  const entity = event.payload?.payment_link?.entity;
  if (!entity) return;
  await prisma.paymentLink.updateMany({
    where: { razorpayLinkId: String(entity.id) },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Handles Razorpay `payment_link.expired` webhook events.
 */
export async function handlePaymentLinkExpired(event: RazorpayEvent) {
  const entity = event.payload?.payment_link?.entity;
  if (!entity) return;
  await prisma.paymentLink.updateMany({
    where: { razorpayLinkId: String(entity.id) },
    data: { status: 'EXPIRED' },
  });
}

/**
 * Handles Razorpay `payment.captured` webhook events.
 */
export async function handlePaymentCaptured(event: RazorpayEvent) {
  const entity = event.payload?.payment?.entity;
  if (!entity) return;

  const notes = (entity.notes ?? {}) as Record<string, string>;
  let invoiceId = notes.invoiceId;
  let paymentLinkId: string | null = null;

  if (!invoiceId && entity.payment_link_id) {
    const link = await prisma.paymentLink.findUnique({
      where: { razorpayLinkId: String(entity.payment_link_id) },
    });
    if (link) {
      invoiceId = link.invoiceId;
      paymentLinkId = link.id;
    }
  }

  if (!invoiceId) return;

  await upsertPaymentFromEntity(invoiceId, paymentLinkId, entity, 'CAPTURED');
  await syncInvoicePaymentStatus(invoiceId);
}

/**
 * Handles Razorpay `payment.failed` webhook events.
 */
export async function handlePaymentFailed(event: RazorpayEvent) {
  const entity = event.payload?.payment?.entity;
  if (!entity) return;

  const notes = (entity.notes ?? {}) as Record<string, string>;
  const invoiceId = notes.invoiceId;
  if (!invoiceId) return;

  await upsertPaymentFromEntity(invoiceId, null, entity, 'FAILED');
}

/**
 * Handles Razorpay `refund.processed` webhook events.
 */
export async function handleRefundProcessed(event: RazorpayEvent) {
  const entity = event.payload?.refund?.entity ?? event.payload?.payment?.entity;
  if (!entity) return;

  const paymentId = String(entity.payment_id ?? entity.id);
  const existing = await prisma.payment.findUnique({ where: { razorpayPaymentId: paymentId } });
  if (!existing) return;

  await prisma.payment.update({
    where: { id: existing.id },
    data: { status: 'REFUNDED', rawPayload: entity as object },
  });
}

async function upsertPaymentFromEntity(
  invoiceId: string,
  paymentLinkId: string | null,
  entity: Record<string, unknown>,
  status: string,
) {
  const razorpayPaymentId = String(entity.id);
  const amount = paiseToDecimal(entityAmountPaise(entity));

  await prisma.payment.upsert({
    where: { razorpayPaymentId },
    update: {
      status,
      amount,
      method: entity.method ? String(entity.method) : null,
      capturedAt: status === 'CAPTURED' ? new Date() : null,
      rawPayload: entity as Prisma.InputJsonValue,
    },
    create: {
      invoiceId,
      paymentLinkId,
      razorpayPaymentId,
      razorpayOrderId: entity.order_id ? String(entity.order_id) : null,
      amount,
      currency: String(entity.currency ?? 'INR'),
      method: entity.method ? String(entity.method) : null,
      status,
      fee: entity.fee != null ? paiseToDecimal(Number(entity.fee)) : null,
      tax: entity.tax != null ? paiseToDecimal(Number(entity.tax)) : null,
      capturedAt: status === 'CAPTURED' ? new Date() : null,
      rawPayload: entity as Prisma.InputJsonValue,
    },
  });
}

/**
 * Dispatches a verified Razorpay webhook event to the appropriate handler.
 */
export async function dispatchRazorpayEvent(event: RazorpayEvent) {
  switch (event.event) {
    case 'payment_link.paid':
      await handlePaymentLinkPaid(event);
      break;
    case 'payment_link.cancelled':
      await handlePaymentLinkCancelled(event);
      break;
    case 'payment_link.expired':
      await handlePaymentLinkExpired(event);
      break;
    case 'payment.captured':
      await handlePaymentCaptured(event);
      break;
    case 'payment.failed':
      await handlePaymentFailed(event);
      break;
    case 'refund.processed':
      await handleRefundProcessed(event);
      break;
    default:
      break;
  }
}

/**
 * Maps Razorpay payment-link status to local PaymentLink status.
 */
export function mapRazorpayLinkStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return 'PAID';
  if (normalized === 'cancelled') return 'CANCELLED';
  if (normalized === 'expired') return 'EXPIRED';
  if (normalized === 'partially_paid') return 'PARTIALLY_PAID';
  return 'CREATED';
}
