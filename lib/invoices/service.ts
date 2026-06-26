import { prisma } from '@/lib/prisma';
import { calcInvoice, calcLine } from '@/lib/calc';
import { allocateInvoiceNumber } from './numbering';

interface LineItemInput {
  productId?: string | null;
  itemName: string;
  description?: string | null;
  hsnSac?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  discountPct?: number;
  taxPct: number;
  sortOrder?: number;
}

interface CreateInvoiceInput {
  invoiceNumber?: string;
  invoiceDate: Date;
  dueDate: Date;
  referenceNo?: string | null;
  paymentTerms: string;
  customerId: string;
  billingAddress: string;
  shippingAddress?: string | null;
  shippingCharges?: number;
  roundOff?: number;
  notes?: string | null;
  terms?: string | null;
  status?: string;
  attachmentUrl?: string | null;
  lineItems: LineItemInput[];
  createdById: string;
  teamId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
}

/**
 * Creates an invoice with calculated totals and line items in a transaction.
 */
export async function createInvoiceRecord(input: CreateInvoiceInput) {
  const company = await prisma.company.findFirst();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } });

  const totals = calcInvoice(
    input.lineItems.map((l) => ({
      qty: l.quantity,
      rate: l.rate,
      discountPct: l.discountPct ?? 0,
      taxPct: l.taxPct,
    })),
    {
      customerState: customer.state,
      companyState: company?.state ?? customer.state,
      shipping: input.shippingCharges ?? 0,
      roundOff: input.roundOff ?? 0,
    },
  );

  const invoiceNumber = input.invoiceNumber ?? (await allocateInvoiceNumber());

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      referenceNo: input.referenceNo,
      paymentTerms: input.paymentTerms,
      customerId: input.customerId,
      billingAddress: input.billingAddress,
      shippingAddress: input.shippingAddress,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      shippingCharges: totals.shippingCharges,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      amountInWords: totals.amountInWords,
      notes: input.notes,
      terms: input.terms,
      status: input.status ?? 'DRAFT',
      attachmentUrl: input.attachmentUrl,
      createdById: input.createdById,
      teamId: input.teamId,
      branchId: input.branchId,
      departmentId: input.departmentId,
      lineItems: {
        create: input.lineItems.map((line, idx) => {
          const computed = calcLine({
            qty: line.quantity,
            rate: line.rate,
            discountPct: line.discountPct ?? 0,
            taxPct: line.taxPct,
          });
          return {
            productId: line.productId,
            itemName: line.itemName,
            description: line.description,
            hsnSac: line.hsnSac,
            quantity: line.quantity,
            unit: line.unit,
            rate: line.rate,
            discountPct: line.discountPct ?? 0,
            taxPct: line.taxPct,
            gross: computed.gross,
            discountAmt: computed.discountAmt,
            taxableValue: computed.taxableValue,
            taxAmt: computed.taxAmt,
            lineTotal: computed.lineTotal,
            sortOrder: line.sortOrder ?? idx,
          };
        }),
      },
    },
    include: { lineItems: true, customer: true },
  });
}

/**
 * Updates an invoice, replacing line items and recalculating totals.
 */
export async function updateInvoiceRecord(id: string, input: Partial<CreateInvoiceInput>) {
  const existing = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: { customer: true, lineItems: true },
  });

  const lineItems = input.lineItems ?? existing.lineItems.map((l) => ({
    productId: l.productId,
    itemName: l.itemName,
    description: l.description,
    hsnSac: l.hsnSac,
    quantity: Number(l.quantity),
    unit: l.unit,
    rate: Number(l.rate),
    discountPct: Number(l.discountPct),
    taxPct: l.taxPct,
    sortOrder: l.sortOrder,
  }));

  if (!lineItems || lineItems.length === 0) {
    throw new Error('Invoice must have at least one line item');
  }

  const customer = input.customerId
    ? await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } })
    : existing.customer;
  const company = await prisma.company.findFirst();

  const totals = calcInvoice(
    lineItems.map((l) => ({
      qty: l.quantity,
      rate: l.rate,
      discountPct: l.discountPct ?? 0,
      taxPct: l.taxPct,
    })),
    {
      customerState: customer.state,
      companyState: company?.state ?? customer.state,
      shipping: input.shippingCharges ?? Number(existing.shippingCharges),
      roundOff: input.roundOff ?? Number(existing.roundOff),
    },
  );

  return prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        referenceNo: input.referenceNo,
        paymentTerms: input.paymentTerms,
        customerId: input.customerId,
        billingAddress: input.billingAddress,
        shippingAddress: input.shippingAddress,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        taxableAmount: totals.taxableAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        shippingCharges: totals.shippingCharges,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        amountInWords: totals.amountInWords,
        notes: input.notes,
        terms: input.terms,
        status: input.status,
        attachmentUrl: input.attachmentUrl,
        lineItems: {
          create: lineItems.map((line, idx) => {
            const computed = calcLine({
              qty: line.quantity,
              rate: line.rate,
              discountPct: line.discountPct ?? 0,
              taxPct: line.taxPct,
            });
            return {
              productId: line.productId,
              itemName: line.itemName,
              description: line.description,
              hsnSac: line.hsnSac,
              quantity: line.quantity,
              unit: line.unit,
              rate: line.rate,
              discountPct: line.discountPct ?? 0,
              taxPct: line.taxPct,
              gross: computed.gross,
              discountAmt: computed.discountAmt,
              taxableValue: computed.taxableValue,
              taxAmt: computed.taxAmt,
              lineTotal: computed.lineTotal,
              sortOrder: line.sortOrder ?? idx,
            };
          }),
        },
      },
      include: { lineItems: true, customer: true },
    });
  });
}

/**
 * Duplicates an invoice as a new DRAFT with a fresh invoice number.
 */
export async function duplicateInvoiceRecord(id: string, createdById: string) {
  const source = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: { lineItems: true },
  });

  return createInvoiceRecord({
    invoiceDate: new Date(),
    dueDate: source.dueDate,
    referenceNo: source.referenceNo,
    paymentTerms: source.paymentTerms,
    customerId: source.customerId,
    billingAddress: source.billingAddress,
    shippingAddress: source.shippingAddress,
    shippingCharges: Number(source.shippingCharges),
    roundOff: Number(source.roundOff),
    notes: source.notes,
    terms: source.terms,
    status: 'DRAFT',
    attachmentUrl: source.attachmentUrl,
    createdById,
    teamId: source.teamId,
    branchId: source.branchId,
    departmentId: source.departmentId,
    lineItems: source.lineItems.map((l) => ({
      productId: l.productId,
      itemName: l.itemName,
      description: l.description,
      hsnSac: l.hsnSac,
      quantity: Number(l.quantity),
      unit: l.unit,
      rate: Number(l.rate),
      discountPct: Number(l.discountPct),
      taxPct: l.taxPct,
      sortOrder: l.sortOrder,
    })),
  });
}
