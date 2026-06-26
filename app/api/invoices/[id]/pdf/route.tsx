import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { renderInvoicePdfBuffer } from '@/lib/pdf/render';
import { format } from 'date-fns';
import type { Prisma } from '@prisma/client';

/**
 * Generates and streams a PDF for the given invoice.
 */
export const GET = withPrivilege(
  { action: 'INVOICE.DOWNLOAD_PDF', applyRecordScope: 'INVOICES' },
  async (_req, ctx, routeCtx) => {
    const id = routeCtx?.params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const scopeWhere = buildScopeWhere(ctx.recordScope!, {
      ownerField: 'createdById',
      teamField: 'teamId',
      branchField: 'branchId',
      departmentField: 'departmentId',
    }) as Prisma.InvoiceWhereInput;

    const invoice = await prisma.invoice.findFirst({
      where: { id, ...scopeWhere },
      include: {
        customer: true,
        lineItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const company = await prisma.company.findFirst();
    if (!company) {
      return NextResponse.json({ error: 'Company profile not configured' }, { status: 500 });
    }

    const pdfData = {
      company: {
        name: company.name,
        email: company.email,
        phone: company.phone,
        gstin: company.gstin,
        addressLine1: company.addressLine1,
        addressLine2: company.addressLine2,
        city: company.city,
        state: company.state,
        pincode: company.pincode,
      },
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: format(invoice.invoiceDate, 'dd MMM yyyy'),
        dueDate: format(invoice.dueDate, 'dd MMM yyyy'),
        referenceNo: invoice.referenceNo,
        paymentTerms: invoice.paymentTerms,
        billingAddress: invoice.billingAddress,
        shippingAddress: invoice.shippingAddress,
        status: invoice.status,
        subtotal: Number(invoice.subtotal),
        totalDiscount: Number(invoice.totalDiscount),
        taxableAmount: Number(invoice.taxableAmount),
        cgst: Number(invoice.cgst),
        sgst: Number(invoice.sgst),
        igst: Number(invoice.igst),
        shippingCharges: Number(invoice.shippingCharges),
        roundOff: Number(invoice.roundOff),
        grandTotal: Number(invoice.grandTotal),
        amountInWords: invoice.amountInWords,
        notes: invoice.notes,
        terms: invoice.terms,
        customer: {
          name: invoice.customer.name,
          email: invoice.customer.email,
          phone: invoice.customer.phone,
          gstin: invoice.customer.gstin,
        },
        lineItems: invoice.lineItems.map((line) => ({
          itemName: line.itemName,
          description: line.description,
          hsnSac: line.hsnSac,
          quantity: Number(line.quantity),
          unit: line.unit,
          rate: Number(line.rate),
          discountPct: Number(line.discountPct),
          taxPct: line.taxPct,
          lineTotal: Number(line.lineTotal),
        })),
      },
    };

    const bytes = await renderInvoicePdfBuffer(pdfData);

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      },
    });
  },
);
