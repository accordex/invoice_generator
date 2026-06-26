import { prisma } from '@/lib/prisma';
import { getBoss } from '@/lib/jobs/queue';

/**
 * Finds users affected by grants that just expired and enqueues privilege recompute jobs.
 */
export async function expireTimedGrants(): Promise<void> {
  const now = new Date();

  const [expiredRoleGrants, expiredOverrides, expiredUserRoles] = await Promise.all([
    prisma.rolePrivilegeGrant.findMany({
      where: {
        validUntil: { lte: now },
      },
      select: { role: { select: { userRoles: { select: { userId: true } } } } },
    }),
    prisma.userPrivilegeOverride.findMany({
      where: { validUntil: { lte: now } },
      select: { userId: true },
    }),
    prisma.userRole.findMany({
      where: { validUntil: { lte: now } },
      select: { userId: true },
    }),
  ]);

  const userIds = new Set<string>();
  for (const grant of expiredRoleGrants) {
    for (const ur of grant.role.userRoles) {
      userIds.add(ur.userId);
    }
  }
  for (const override of expiredOverrides) {
    userIds.add(override.userId);
  }
  for (const ur of expiredUserRoles) {
    userIds.add(ur.userId);
  }

  if (userIds.size === 0) return;

  const boss = await getBoss();
  await Promise.all(
    Array.from(userIds).map((userId) => boss.send('privilege:recompute', { userId })),
  );
}
