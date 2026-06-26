import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import type { PrivilegedContext } from '@/lib/privilege/withPrivilege';
import { resolveOne } from '@/lib/privilege/resolver';

type Scope = NonNullable<PrivilegedContext['recordScope']>;

const INVOICE_SCOPE_FIELDS = {
  ownerField: 'createdById',
  teamField: 'teamId',
  branchField: 'branchId',
  departmentField: 'departmentId',
};

/**
 * Returns dashboard widget payloads visible to the requesting user.
 */
export async function getDashboardWidgets(userId: string, isSuperAdmin: boolean, scope?: Scope) {
  const invoiceWhere = scope
    ? buildScopeWhere(scope, INVOICE_SCOPE_FIELDS)
    : isSuperAdmin
      ? {}
      : { createdById: userId };

  const widgetCodes = [
    'WIDGET_REVENUE_MTD',
    'WIDGET_REVENUE_YTD',
    'WIDGET_OUTSTANDING',
    'WIDGET_OVERDUE_COUNT',
    'WIDGET_TOP_CUSTOMERS',
    'WIDGET_RECENT_INVOICES',
    'WIDGET_RECENT_PAYMENTS',
    'WIDGET_INVOICES_BY_STATUS',
    'WIDGET_REVENUE_TREND',
    'WIDGET_TAX_COLLECTED_MTD',
    'WIDGET_PENDING_APPROVALS',
  ];

  const visible: string[] = [];
  for (const code of widgetCodes) {
    if (isSuperAdmin) {
      visible.push(code);
      continue;
    }
    const { mode } = await resolveOne(userId, 'DASHBOARD_WIDGET', code);
    if (mode === 'VISIBLE' || mode === 'VIEW' || mode === 'EDIT') {
      visible.push(code);
    }
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const widgets: Record<string, unknown> = {};

  if (visible.includes('WIDGET_REVENUE_MTD')) {
    const agg = await prisma.invoice.aggregate({
      where: { ...invoiceWhere, status: 'PAID', invoiceDate: { gte: monthStart } },
      _sum: { grandTotal: true },
    });
    widgets.WIDGET_REVENUE_MTD = { amount: Number(agg._sum.grandTotal ?? 0) };
  }

  if (visible.includes('WIDGET_REVENUE_YTD')) {
    const agg = await prisma.invoice.aggregate({
      where: { ...invoiceWhere, status: 'PAID', invoiceDate: { gte: yearStart } },
      _sum: { grandTotal: true },
    });
    widgets.WIDGET_REVENUE_YTD = { amount: Number(agg._sum.grandTotal ?? 0) };
  }

  if (visible.includes('WIDGET_OUTSTANDING')) {
    const agg = await prisma.invoice.aggregate({
      where: { ...invoiceWhere, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
      _sum: { grandTotal: true },
    });
    widgets.WIDGET_OUTSTANDING = { amount: Number(agg._sum.grandTotal ?? 0) };
  }

  if (visible.includes('WIDGET_OVERDUE_COUNT')) {
    const count = await prisma.invoice.count({
      where: {
        ...invoiceWhere,
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: now },
      },
    });
    widgets.WIDGET_OVERDUE_COUNT = { count };
  }

  if (visible.includes('WIDGET_TOP_CUSTOMERS')) {
    const rows = await prisma.invoice.groupBy({
      by: ['customerId'],
      where: { ...invoiceWhere, status: 'PAID' },
      _sum: { grandTotal: true },
    });
    const top = [...rows]
      .sort((a, b) => Number(b._sum.grandTotal ?? 0) - Number(a._sum.grandTotal ?? 0))
      .slice(0, 5);
    const customers = await prisma.customer.findMany({
      where: { id: { in: top.map((r) => r.customerId) } },
      select: { id: true, name: true },
    });
    const names = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    widgets.WIDGET_TOP_CUSTOMERS = top.map((r) => ({
      customerId: r.customerId,
      customerName: names[r.customerId],
      revenue: Number(r._sum.grandTotal ?? 0),
    }));
  }

  if (visible.includes('WIDGET_RECENT_INVOICES')) {
    widgets.WIDGET_RECENT_INVOICES = await prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        grandTotal: true,
        invoiceDate: true,
      },
    });
  }

  if (visible.includes('WIDGET_RECENT_PAYMENTS')) {
    widgets.WIDGET_RECENT_PAYMENTS = await prisma.payment.findMany({
      where: { invoice: invoiceWhere },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        amount: true,
        status: true,
        method: true,
        capturedAt: true,
        invoice: { select: { invoiceNumber: true } },
      },
    });
  }

  if (visible.includes('WIDGET_INVOICES_BY_STATUS')) {
    widgets.WIDGET_INVOICES_BY_STATUS = await prisma.invoice.groupBy({
      by: ['status'],
      where: invoiceWhere,
      _count: true,
    });
  }

  if (visible.includes('WIDGET_REVENUE_TREND')) {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const invoices = await prisma.invoice.findMany({
      where: { ...invoiceWhere, status: 'PAID', invoiceDate: { gte: start } },
      select: { invoiceDate: true, grandTotal: true },
    });
    const buckets = new Map<string, number>();
    for (const inv of invoices) {
      const key = `${inv.invoiceDate.getFullYear()}-${String(inv.invoiceDate.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) ?? 0) + Number(inv.grandTotal));
    }
    widgets.WIDGET_REVENUE_TREND = Array.from(buckets.entries()).map(([month, amount]) => ({ month, amount }));
  }

  if (visible.includes('WIDGET_TAX_COLLECTED_MTD')) {
    const agg = await prisma.invoice.aggregate({
      where: { ...invoiceWhere, status: 'PAID', invoiceDate: { gte: monthStart } },
      _sum: { cgst: true, sgst: true, igst: true },
    });
    widgets.WIDGET_TAX_COLLECTED_MTD = {
      total:
        Number(agg._sum.cgst ?? 0) + Number(agg._sum.sgst ?? 0) + Number(agg._sum.igst ?? 0),
    };
  }

  if (visible.includes('WIDGET_PENDING_APPROVALS')) {
    widgets.WIDGET_PENDING_APPROVALS = await prisma.approvalRequest.count({
      where: { requesterId: userId, status: 'PENDING' },
    });
  }

  return widgets;
}
