import { z } from 'zod';

/** Indian GSTIN format: 15 characters. */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const CUSTOMER_TYPES = ['INDIVIDUAL', 'BUSINESS'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

const gstinSchema = z
  .string()
  .trim()
  .regex(GSTIN_REGEX, 'Invalid GSTIN format')
  .optional()
  .nullable();

/**
 * Shared customer fields for create and update payloads.
 */
const customerFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: z.enum(CUSTOMER_TYPES, {
    errorMap: () => ({ message: 'Type must be INDIVIDUAL or BUSINESS' }),
  }),
  email: z.string().trim().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone must be at least 10 digits')
    .max(15, 'Phone must be at most 15 digits'),
  gstin: gstinSchema,
  billingAddress: z.string().trim().min(1, 'Billing address is required'),
  shippingAddress: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be a 6-digit number'),
  notes: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

/**
 * Validates GSTIN is present when customer type is BUSINESS.
 *
 * @param data - Parsed customer payload.
 * @param ctx - Zod refinement context.
 */
function requireGstinForBusiness(
  data: { type: CustomerType; gstin?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.type === 'BUSINESS' && !data.gstin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'GSTIN is required for business customers',
      path: ['gstin'],
    });
  }
}

/**
 * Zod schema for creating a customer.
 * GSTIN is required when `type` is `BUSINESS`.
 */
export const createCustomerSchema = customerFieldsSchema.superRefine(requireGstinForBusiness);

/**
 * Zod schema for updating a customer.
 * GSTIN is required when resulting `type` is `BUSINESS`.
 */
export const updateCustomerSchema = customerFieldsSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.type === 'BUSINESS') {
      requireGstinForBusiness({ type: 'BUSINESS', gstin: data.gstin }, ctx);
    }
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
