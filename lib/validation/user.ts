import { z } from 'zod';

/** Fields shared by create and update user payloads. */
const userFieldsSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  name: z.string().trim().min(1, 'Name is required').max(200),
  roleId: z.string().min(1, 'Role is required'),
  teamId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

/**
 * Schema for creating a new user with credentials and initial role.
 */
export const createUserSchema = userFieldsSchema.extend({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

/**
 * Schema for updating an existing user. Password is optional (blank = unchanged).
 */
export const updateUserSchema = userFieldsSchema
  .extend({
    password: z.string().max(128, 'Password must be at most 128 characters').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password && data.password.length > 0 && data.password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must be at least 8 characters',
        path: ['password'],
      });
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
