import { z } from 'zod';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Zod schema for the singleton company profile.
 */
export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(200),
  logoUrl: z.string().url('Invalid logo URL').optional().nullable(),
  email: z.string().trim().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone must be at least 10 digits')
    .max(15, 'Phone must be at most 15 digits'),
  gstin: z
    .string()
    .trim()
    .regex(GSTIN_REGEX, 'Invalid GSTIN format')
    .optional()
    .nullable(),
  pan: z
    .string()
    .trim()
    .regex(PAN_REGEX, 'Invalid PAN format')
    .optional()
    .nullable(),
  addressLine1: z.string().trim().min(1, 'Address line 1 is required'),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be a 6-digit number'),
  country: z.string().trim().min(1).default('India'),
  defaultCurrency: z.string().trim().length(3).default('INR'),
  bankName: z.string().trim().optional().nullable(),
  accountNumber: z.string().trim().max(30).optional().nullable(),
  ifsc: z
    .string()
    .trim()
    .regex(IFSC_REGEX, 'Invalid IFSC code')
    .optional()
    .nullable(),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
