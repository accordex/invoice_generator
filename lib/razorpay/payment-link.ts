import { prisma } from '@/lib/prisma';
import { getRazorpay } from './client';

/**
 * Creates a Razorpay payment link for an invoice and persists the link record.
 */
export async function createPaymentLinkForInvoice(invoiceId: string, createdById: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });

  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
    throw new Error(`Cannot create payment link for ${invoice.status} invoice`);
  }

  const amountPaise = Math.round(Number(invoice.grandTotal) * 100);

  const link = await getRazorpay().paymentLink.create({
    amount: amountPaise,
    currency: 'INR',
    accept_partial: false,
    description: `Invoice ${invoice.invoiceNumber}`,
    customer: {
      name: invoice.customer.name,
      email: invoice.customer.email,
      contact: invoice.customer.phone,
    },
    notify: { sms: true, email: true },
    reminder_enable: true,
    notes: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
    callback_url: `${process.env.APP_BASE_URL}/invoices/${invoice.id}/preview`,
    callback_method: 'get',
  });

  return prisma.paymentLink.create({
    data: {
      invoiceId: invoice.id,
      razorpayLinkId: link.id,
      shortUrl: link.short_url,
      amount: invoice.grandTotal,
      currency: 'INR',
      status: 'CREATED',
      createdById,
    },
  });
}
