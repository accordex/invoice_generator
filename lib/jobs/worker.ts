import { getBoss } from './queue';
import { recomputeEffectivePrivileges } from './handlers/privilege-recompute';
import { expireTimedGrants } from './handlers/grant-expiry';
import { expirePendingApprovals } from './handlers/approval-expiry';
import { reconcileRazorpayPayments } from './handlers/razorpay-reconcile';
import { sendInvoicePaymentReminders } from './handlers/invoice-payment-reminder';

interface RecomputeJobData {
  userId: string;
}

/**
 * Starts the pg-boss worker with on-demand and scheduled job handlers.
 */
async function main() {
  const boss = await getBoss();

  await boss.work<RecomputeJobData>('privilege:recompute', async (jobs) => {
    for (const job of jobs) {
      if (!job.data.userId) {
        throw new Error('privilege:recompute requires userId');
      }
      await recomputeEffectivePrivileges(job.data.userId);
    }
  });

  await boss.schedule('privilege:expire-grants', '*/5 * * * *');
  await boss.work('privilege:expire-grants', async () => {
    await expireTimedGrants();
  });

  await boss.schedule('approval:expire-pending', '0 * * * *');
  await boss.work('approval:expire-pending', async () => {
    await expirePendingApprovals();
  });

  await boss.schedule('razorpay:reconcile', '0 */2 * * *');
  await boss.work('razorpay:reconcile', async () => {
    await reconcileRazorpayPayments();
  });

  await boss.schedule('invoice-payment-reminder', '0 9 * * *');
  await boss.work('invoice-payment-reminder', async () => {
    await sendInvoicePaymentReminders();
  });

  console.info('Worker started');
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
