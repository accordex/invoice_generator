import { z } from 'zod';
import { TAX_RATES } from './product';

export const INVOICE_STATUSES = [
  'DRAFT',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const lineItemSchema = z.object({
  productId: z.string().cuid().optional().nullable(),
  itemName: z.string().trim().min(1, 'Item name is required'),
  description: z.string().trim().optional().nullable(),
  hsnSac: z.string().trim().max(20).optional().nullable(),
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be greater than zero'),
  unit: z.string().trim().min(1, 'Unit is required'),
  rate: z.coerce
    .number({ invalid_type_error: 'Rate must be a number' })
    .nonnegative('Rate cannot be negative'),
  discountPct: z.coerce
    .number()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .default(0),
  taxPct: z.coerce
    .number()
    .int()
    .refine((v) => (TAX_RATES as readonly number[]).includes(v), {
      message: 'Tax rate must be 0, 5, 12, 18, or 28',
    }),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

const invoiceHeaderSchema = z.object({
  invoiceNumber: z.string().trim().min(1).optional(),
  invoiceDate: z.coerce.date({ invalid_type_error: 'Invalid invoice date' }),
  dueDate: z.coerce.date({ invalid_type_error: 'Invalid due date' }),
  referenceNo: z.string().trim().optional().nullable(),
  paymentTerms: z.string().trim().min(1, 'Payment terms are required'),
  customerId: z.string().cuid('Invalid customer ID'),
  billingAddress: z.string().trim().min(1, 'Billing address is required'),
  shippingAddress: z.string().trim().optional().nullable(),
  shippingCharges: z.coerce.number().nonnegative().default(0),
  roundOff: z.coerce.number().default(0),
  notes: z.string().trim().optional().nullable(),
  terms: z.string().trim().optional().nullable(),
  status: z.enum(INVOICE_STATUSES).optional().default('DRAFT'),
  attachmentUrl: z.string().url().optional().nullable(),
});

/**
 * Validates due date is on or after invoice date.
 */
function validateDates(
  data: { invoiceDate: Date; dueDate: Date },
  ctx: z.RefinementCtx,
): void {
  if (data.dueDate < data.invoiceDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Due date cannot be before invoice date',
      path: ['dueDate'],
    });
  }
}

/**
 * Zod schema for creating an invoice with line items.
 */
export const createInvoiceSchema = invoiceHeaderSchema
  .extend({
    lineItems: z
      .array(lineItemSchema)
      .min(1, 'At least one line item is required'),
  })
  .superRefine(validateDates);

/**
 * Zod schema for updating an invoice.
 * Line items, when provided, replace all existing line items.
 */
export const updateInvoiceSchema = invoiceHeaderSchema
  .partial()
  .extend({
    lineItems: z.array(lineItemSchema).min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.invoiceDate && data.dueDate) {
      validateDates(
        { invoiceDate: data.invoiceDate, dueDate: data.dueDate },
        ctx,
      );
    }
  });

export const invoiceLineItemSchema = lineItemSchema;
export type InvoiceLineItemInput = z.infer<typeof lineItemSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
