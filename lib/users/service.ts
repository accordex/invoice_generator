import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { recomputeEffectivePrivileges } from '@/lib/privilege/resolver';
import type { CreateUserInput, UpdateUserInput } from '@/lib/validation/user';

const BCRYPT_ROUNDS = 10;

/**
 * Creates a user with hashed password and assigns one role in a transaction.
 *
 * @param input - Validated user payload.
 * @param assignedBy - Actor user id for audit linkage.
 * @returns Created user id and email.
 */
export async function createUser(
  input: CreateUserInput,
  assignedBy: string,
): Promise<{ id: string; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error('A user with this email already exists');
  }

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) {
    throw new Error('Selected role does not exist');
  }
  if (role.code === 'SUPER_ADMIN') {
    throw new Error('Super Admin role cannot be assigned through this form');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        isActive: input.isActive ?? true,
        isSuperAdmin: false,
        teamId: input.teamId || null,
        branchId: input.branchId || null,
        departmentId: input.departmentId || null,
      },
    });

    await tx.userRole.create({
      data: {
        userId: created.id,
        roleId: input.roleId,
        assignedBy,
      },
    });

    return created;
  });

  await recomputeEffectivePrivileges(user.id);

  return { id: user.id, email: user.email };
}

/**
 * Updates user profile, optional password, org linkage, and primary role.
 *
 * @param userId - Target user id.
 * @param input - Validated update payload.
 * @param assignedBy - Actor user id for role reassignment audit.
 */
export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  assignedBy: string,
): Promise<{ id: string; email: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }
  if (user.isSuperAdmin) {
    throw new Error('Super Admin account cannot be edited through this form');
  }

  const emailTaken = await prisma.user.findFirst({
    where: { email: input.email, id: { not: userId } },
  });
  if (emailTaken) {
    throw new Error('A user with this email already exists');
  }

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) {
    throw new Error('Selected role does not exist');
  }
  if (role.code === 'SUPER_ADMIN') {
    throw new Error('Super Admin role cannot be assigned through this form');
  }

  const data: {
    email: string;
    name: string;
    isActive: boolean;
    teamId: string | null;
    branchId: string | null;
    departmentId: string | null;
    passwordHash?: string;
  } = {
    email: input.email,
    name: input.name,
    isActive: input.isActive ?? true,
    teamId: input.teamId || null,
    branchId: input.branchId || null,
    departmentId: input.departmentId || null,
  };

  if (input.password && input.password.length >= 8) {
    data.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data });

    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.create({
      data: {
        userId,
        roleId: input.roleId,
        assignedBy,
      },
    });
  });

  await recomputeEffectivePrivileges(userId);

  return { id: userId, email: input.email };
}
