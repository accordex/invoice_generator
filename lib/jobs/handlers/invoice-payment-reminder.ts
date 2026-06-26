import { prisma } from '@/lib/prisma';

/**
 * Logs payment reminders for overdue sent/partially-paid invoices.
 */
export async function sendInvoicePaymentReminders(): Promise<void> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdue = await prisma.invoice.findMany({
    where: {
      status: { in: ['SENT', 'PARTIALLY_PAID'] },
      dueDate: { lt: startOfToday },
    },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      paymentLinks: {
        where: { status: { in: ['CREATED', 'PARTIALLY_PAID'] } },
        take: 1,
      },
    },
    take: 500,
  });

  for (const invoice of overdue) {
    const activeLink = invoice.paymentLinks[0];
    console.info('invoice-payment-reminder', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      dueDate: invoice.dueDate.toISOString(),
      customerEmail: invoice.customer.email,
      customerPhone: invoice.customer.phone,
      paymentLinkUrl: activeLink?.shortUrl ?? null,
      grandTotal: Number(invoice.grandTotal),
    });
  }
}
