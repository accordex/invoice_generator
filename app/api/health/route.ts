import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Public health check for deployment diagnostics (no auth).
 * GET /api/health — verifies DB connectivity and required env vars.
 */
export async function GET() {
  const checks: Record<string, string> = {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    authSecret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET ? 'set' : 'missing',
    authUrl: process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'missing',
    databaseUrl: process.env.DATABASE_URL ? 'set' : 'missing',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'error';
    checks.databaseError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'unhealthy', checks }, { status: 503 });
  }

  const healthy =
    checks.authSecret === 'set' &&
    checks.databaseUrl === 'set' &&
    checks.authUrl !== 'missing';

  return NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    checks,
  });
}
