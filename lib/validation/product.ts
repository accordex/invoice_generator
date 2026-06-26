import { z } from 'zod';

export const PRODUCT_TYPES = ['PRODUCT', 'SERVICE'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const TAX_RATES = [0, 5, 12, 18, 28] as const;
export type TaxRate = (typeof TAX_RATES)[number];

const productFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(200),
  type: z.enum(PRODUCT_TYPES, {
    errorMap: () => ({ message: 'Type must be PRODUCT or SERVICE' }),
  }),
  sku: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  hsnSac: z.string().trim().max(20).optional().nullable(),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  sellingPrice: z.coerce
    .number({ invalid_type_error: 'Selling price must be a number' })
    .nonnegative('Selling price cannot be negative'),
  taxRate: z.coerce
    .number()
    .int()
    .refine((v) => (TAX_RATES as readonly number[]).includes(v), {
      message: 'Tax rate must be 0, 5, 12, 18, or 28',
    }),
  category: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

/**
 * Zod schema for creating a product.
 */
export const createProductSchema = productFieldsSchema;

/**
 * Zod schema for updating a product.
 */
export const updateProductSchema = productFieldsSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
