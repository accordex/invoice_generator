import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().min(1),
  logoUrl: z.string().url().optional().nullable(),
  email: z.string().email(),
  phone: z.string().min(6),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(4),
  country: z.string().default('India'),
  defaultCurrency: z.string().default('INR'),
  bankName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  ifsc: z.string().optional().nullable(),
});

export const customerBaseSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['INDIVIDUAL', 'BUSINESS']),
  email: z.string().email(),
  phone: z.string().min(6),
  gstin: z.string().optional().nullable(),
  billingAddress: z.string().min(1),
  shippingAddress: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(4),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const customerSchema = customerBaseSchema.refine(
  (d) => d.type !== 'BUSINESS' || (d.gstin && d.gstin.length > 0),
  {
    message: 'GSTIN is required for business customers',
    path: ['gstin'],
  },
);

export const customerUpdateSchema = customerBaseSchema.partial();

export const productSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['PRODUCT', 'SERVICE']),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  hsnSac: z.string().optional().nullable(),
  unit: z.string().min(1),
  sellingPrice: z.number().nonnegative(),
  taxRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  category: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const invoiceLineSchema = z.object({
  productId: z.string().optional().nullable(),
  itemName: z.string().min(1),
  description: z.string().optional().nullable(),
  hsnSac: z.string().optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  rate: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).default(0),
  taxPct: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  sortOrder: z.number().int().optional(),
});

export const invoiceSchema = z.object({
  invoiceNumber: z.string().optional(),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  referenceNo: z.string().optional().nullable(),
  paymentTerms: z.string().min(1),
  customerId: z.string().min(1),
  billingAddress: z.string().min(1),
  shippingAddress: z.string().optional().nullable(),
  shippingCharges: z.number().default(0),
  roundOff: z.number().default(0),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']).optional(),
  attachmentUrl: z.string().optional().nullable(),
  lineItems: z.array(invoiceLineSchema).min(1),
});

export const approvalRequestSchema = z.object({
  targetLevel: z.string().min(1),
  targetId: z.string().min(1),
  recordType: z.string().optional().nullable(),
  recordId: z.string().optional().nullable(),
  payload: z.record(z.unknown()).optional().nullable(),
});

export const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const transitionSchema = z.object({
  transitionCode: z.string().min(1),
});
