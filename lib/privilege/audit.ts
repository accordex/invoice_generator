import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/** Parameters for writing an immutable privilege audit log entry. */
export interface PrivilegeAuditParams {
  actorUserId: string;
  action: string;
  affectedRoleId?: string | null;
  affectedUserId?: string | null;
  targetLevel?: string | null;
  targetId?: string | null;
  oldMode?: string | null;
  newMode?: string | null;
  oldMask?: string | null;
  newMask?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Appends an immutable audit log entry for privilege changes.
 * Failures are logged but do not block the calling operation.
 *
 * @param params - Audit event details.
 */
export async function logPrivilegeAudit(params: PrivilegeAuditParams): Promise<void> {
  try {
    await prisma.privilegeAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: params.action,
        affectedRoleId: params.affectedRoleId ?? undefined,
        affectedUserId: params.affectedUserId ?? undefined,
        targetLevel: params.targetLevel ?? undefined,
        targetId: params.targetId ?? undefined,
        oldMode: params.oldMode ?? undefined,
        newMode: params.newMode ?? undefined,
        oldMask: params.oldMask ?? undefined,
        newMask: params.newMask ?? undefined,
        reason: params.reason ?? undefined,
        metadata: params.metadata,
      },
    });
  } catch (error) {
    console.error('[privilege-audit] failed to write audit log', {
      action: params.action,
      actorUserId: params.actorUserId,
      error,
    });
  }
}
