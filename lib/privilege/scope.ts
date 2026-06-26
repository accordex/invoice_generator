import type { PrivilegedContext } from './withPrivilege';
import type { Mode } from './resolver';

/**
 * Builds a Prisma-compatible `where` clause from a resolved RECORD_SCOPE mode.
 *
 * @param scope - Resolved record scope with user org identifiers.
 * @param fields - Column names on the target model for each scope tier.
 * @returns Prisma where filter; `{ id: '__NEVER__' }` when scope cannot be satisfied.
 */
export function buildScopeWhere(
  scope: NonNullable<PrivilegedContext['recordScope']>,
  fields: {
    ownerField?: string;
    teamField?: string;
    branchField?: string;
    departmentField?: string;
  },
): Record<string, unknown> {
  switch (scope.mode as Mode) {
    case 'ALL':
      return {};
    case 'BRANCH':
      return fields.branchField && scope.branchId
        ? { [fields.branchField]: scope.branchId }
        : { id: '__NEVER__' };
    case 'DEPARTMENT':
      return fields.departmentField && scope.departmentId
        ? { [fields.departmentField]: scope.departmentId }
        : { id: '__NEVER__' };
    case 'TEAM':
      return fields.teamField && scope.teamId
        ? { [fields.teamField]: scope.teamId }
        : fields.ownerField
          ? { [fields.ownerField]: scope.userId }
          : { id: '__NEVER__' };
    case 'OWN':
    default:
      return fields.ownerField ? { [fields.ownerField]: scope.userId } : { id: '__NEVER__' };
  }
}

/**
 * Builds a payment list filter scoped via the parent invoice's record scope.
 */
export function buildInvoicePaymentScopeWhere(
  scope: NonNullable<PrivilegedContext['recordScope']>,
): Record<string, unknown> {
  const invoiceWhere = buildScopeWhere(scope, {
    ownerField: 'createdById',
    teamField: 'teamId',
    branchField: 'branchId',
    departmentField: 'departmentId',
  });
  return { invoice: invoiceWhere };
}
