import { NextResponse } from 'next/server';
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { registryLevelCounts } from '@/lib/privilege/registry-query';
import { invoiceManifest } from '@/lib/privilege/manifest';

export const GET = withPrivilege({ action: 'PRIVILEGE.MANAGE' }, async () => {
  const levels = await registryLevelCounts();
  return NextResponse.json({
    product: invoiceManifest.product,
    levels,
  });
});
