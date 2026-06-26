import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { buildScopeWhere } from '@/lib/privilege/scope';
import type { PrivilegedContext } from '@/lib/privilege/withPrivilege';

type Scope = NonNullable<PrivilegedContext['recordScope']>;

/**
 * Runs a report by code with optional record-scope filtering on invoices.
 */
export async function runReport(code: string, scope?: Scope) {
  const invoiceScope: Prisma.InvoiceWhereInput = scope
    ? (buildScopeWhere(scope, {
        ownerField: 'createdById',
        teamField: 'teamId',
        branchField: 'branchId',
        departmentField: 'departmentId',
      }) as Prisma.InvoiceWhereInput)
    : {};

  switch (code) {
    case 'RPT_INVOICE_AGING': {
      const now = new Date();
      const invoices = await prisma.invoice.findMany({
        where: { ...invoiceScope, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
        select: { id: true, invoiceNumber: true, dueDate: true, grandTotal: true, status: true },
      });
      return invoices.map((inv) => ({
        ...inv,
        daysOverdue: Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000)),
        grandTotal: Number(inv.grandTotal),
      }));
    }
    case 'RPT_REVENUE_SUMMARY': {
      const paid = await prisma.invoice.aggregate({
        where: { ...invoiceScope, status: 'PAID' },
        _sum: { grandTotal: true },
        _count: true,
      });
      return {
        paidInvoiceCount: paid._count,
        totalRevenue: Number(paid._sum.grandTotal ?? 0),
      };
    }
    case 'RPT_TAX_LIABILITY': {
      const agg = await prisma.invoice.aggregate({
        where: { ...invoiceScope, status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] } },
        _sum: { cgst: true, sgst: true, igst: true },
      });
      return {
        cgst: Number(agg._sum.cgst ?? 0),
        sgst: Number(agg._sum.sgst ?? 0),
        igst: Number(agg._sum.igst ?? 0),
        total: Number(agg._sum.cgst ?? 0) + Number(agg._sum.sgst ?? 0) + Number(agg._sum.igst ?? 0),
      };
    }
    case 'RPT_PAYMENT_COLLECTION': {
      const payments = await prisma.payment.findMany({
        where: {
          status: 'CAPTURED',
          invoice: invoiceScope,
        },
        include: { invoice: { select: { invoiceNumber: true } } },
        orderBy: { capturedAt: 'desc' },
        take: 500,
      });
      return payments.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoice.invoiceNumber,
        amount: Number(p.amount),
        method: p.method,
        capturedAt: p.capturedAt,
        razorpayPaymentId: p.razorpayPaymentId,
      }));
    }
    case 'RPT_CUSTOMER_LIFETIME': {
      const rows = await prisma.invoice.groupBy({
        by: ['customerId'],
        where: { ...invoiceScope, status: 'PAID' },
        _sum: { grandTotal: true },
        _count: true,
      });
      const customers = await prisma.customer.findMany({
        where: { id: { in: rows.map((r) => r.customerId) } },
        select: { id: true, name: true },
      });
      const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
      return rows.map((r) => ({
        customerId: r.customerId,
        customerName: nameMap[r.customerId] ?? 'Unknown',
        invoiceCount: r._count,
        lifetimeValue: Number(r._sum.grandTotal ?? 0),
      }));
    }
    case 'RPT_TOP_CUSTOMERS': {
      const data = (await runReport('RPT_CUSTOMER_LIFETIME', scope)) as Array<{
        customerName: string;
        lifetimeValue: number;
      }>;
      return [...data]
        .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
        .slice(0, 10);
    }
    case 'RPT_TOP_PRODUCTS': {
      const items = await prisma.invoiceLineItem.findMany({
        where: { invoice: { ...invoiceScope, status: 'PAID' } },
        select: { itemName: true, quantity: true, lineTotal: true },
      });
      const map = new Map<string, { qty: number; revenue: number }>();
      for (const item of items) {
        const cur = map.get(item.itemName) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(item.quantity);
        cur.revenue += Number(item.lineTotal);
        map.set(item.itemName, cur);
      }
      return Array.from(map.entries())
        .map(([name, stats]) => ({ itemName: name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    }
    case 'RPT_INVOICE_STATUS': {
      const groups = await prisma.invoice.groupBy({
        by: ['status'],
        where: invoiceScope,
        _count: true,
        _sum: { grandTotal: true },
      });
      return groups.map((g) => ({
        status: g.status,
        count: g._count,
        totalAmount: Number(g._sum.grandTotal ?? 0),
      }));
    }
    case 'RPT_USER_ACTIVITY': {
      const groups = await prisma.invoice.groupBy({
        by: ['createdById'],
        where: invoiceScope,
        _count: true,
      });
      return groups.map((g) => ({
        userId: g.createdById,
        invoicesCreated: g._count,
      }));
    }
    default:
      throw new Error(`Unknown report code: ${code}`);
  }
}
