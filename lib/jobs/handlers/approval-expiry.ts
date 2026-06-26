import { prisma } from '@/lib/prisma';

const EXPIRY_DAYS = 7;

/**
 * Marks approval requests pending longer than seven days as EXPIRED.
 */
export async function expirePendingApprovals(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.approvalRequest.updateMany({
    where: {
      status: 'PENDING',
      requestedAt: { lt: cutoff },
    },
    data: {
      status: 'EXPIRED',
      resolvedAt: new Date(),
    },
  });
}
