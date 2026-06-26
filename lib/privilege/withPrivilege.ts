import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { pendingApproval } from '@/lib/errors';
import { resolveOne, type Mode } from './resolver';

/** Authenticated request context passed to privileged route handlers. */
export interface PrivilegedContext {
  userId: string;
  isSuperAdmin: boolean;
  teamId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  recordScope?: {
    mode: Mode;
    userId: string;
    teamId?: string | null;
    branchId?: string | null;
    departmentId?: string | null;
  };
}

/** Configuration for privilege checks on a route handler. */
export interface GuardConfig {
  action?: string;
  module?: { code: string; min?: 'VIEW' | 'EDIT' };
  transition?: string;
  bulkAction?: string;
  applyRecordScope?: string;
}

type Handler = (
  req: NextRequest,
  ctx: PrivilegedContext,
  routeCtx?: { params: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a Next.js route handler with authentication and privilege enforcement.
 *
 * @param config - Guard rules (action, module, transition, bulk action, record scope).
 * @param handler - Protected handler receiving authenticated context.
 * @returns Route handler compatible with App Router exports.
 */
export function withPrivilege(config: GuardConfig, handler: Handler) {
  return async (req: NextRequest, routeCtx?: { params: Record<string, string> }): Promise<NextResponse> => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const user = session.user;
    const ctx: PrivilegedContext = {
      userId: user.id,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      teamId: user.teamId,
      branchId: user.branchId,
      departmentId: user.departmentId,
    };

    if (!ctx.isSuperAdmin) {
      if (config.action) {
        const { mode } = await resolveOne(ctx.userId, 'ACTION', config.action);
        if (mode === 'DENY' || mode === 'NO_ACCESS') return forbiddenResponse(config.action);
        if (mode === 'ALLOW_WITH_APPROVAL') return pendingApproval();
      }

      if (config.module) {
        const { mode } = await resolveOne(ctx.userId, 'MODULE', config.module.code);
        const min = config.module.min ?? 'VIEW';
        if (mode === 'NO_ACCESS') return forbiddenResponse(config.module.code);
        if (min === 'EDIT' && mode !== 'EDIT') return forbiddenResponse(config.module.code);
      }

      if (config.transition) {
        const { mode } = await resolveOne(ctx.userId, 'STATUS_TRANSITION', config.transition);
        if (mode === 'DENY' || mode === 'NO_ACCESS') return forbiddenResponse(config.transition);
        if (mode === 'ALLOW_WITH_APPROVAL') return pendingApproval();
      }

      if (config.bulkAction) {
        const { mode } = await resolveOne(ctx.userId, 'BULK_ACTION', config.bulkAction);
        if (mode === 'DENY' || mode === 'NO_ACCESS') return forbiddenResponse(config.bulkAction);
        if (mode === 'ALLOW_WITH_APPROVAL') return pendingApproval();
      }

      if (config.applyRecordScope) {
        const { mode } = await resolveOne(ctx.userId, 'RECORD_SCOPE', config.applyRecordScope);
        ctx.recordScope = {
          mode,
          userId: ctx.userId,
          teamId: ctx.teamId,
          branchId: ctx.branchId,
          departmentId: ctx.departmentId,
        };
      }
    } else if (config.applyRecordScope) {
      ctx.recordScope = {
        mode: 'ALL',
        userId: ctx.userId,
        teamId: ctx.teamId,
        branchId: ctx.branchId,
        departmentId: ctx.departmentId,
      };
    }

    return handler(req, ctx, routeCtx);
  };
}

/**
 * Authenticates the request without additional privilege checks.
 * Used for self-service endpoints like `/api/me/privileges`.
 */
export function withAuth(handler: Handler) {
  return withPrivilege({}, handler);
}

function forbiddenResponse(code: string): NextResponse {
  return NextResponse.json({ error: 'Forbidden', code }, { status: 403 });
}
