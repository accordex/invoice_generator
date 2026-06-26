import { prisma } from '@/lib/prisma';

export type TargetLevel =
  | 'MENU_ITEM'
  | 'MODULE'
  | 'FORM'
  | 'TAB'
  | 'SECTION'
  | 'FIELD'
  | 'BUTTON'
  | 'LIST_COLUMN'
  | 'LIST_FILTER'
  | 'BULK_ACTION'
  | 'ACTION'
  | 'STATUS_TRANSITION'
  | 'RECORD_SCOPE'
  | 'REPORT'
  | 'DASHBOARD_WIDGET';

export type Mode =
  | 'NO_ACCESS'
  | 'HIDDEN'
  | 'COLLAPSED'
  | 'DISABLED'
  | 'VISIBLE'
  | 'VIEW'
  | 'EDIT'
  | 'MASKED'
  | 'REQUIRED'
  | 'OPTIONAL'
  | 'ALLOW'
  | 'DENY'
  | 'ALLOW_WITH_APPROVAL'
  | 'OWN'
  | 'TEAM'
  | 'BRANCH'
  | 'DEPARTMENT'
  | 'ALL'
  | 'EXPORT';

/** Client/server privilege map keyed by `${level}:${code}`. */
export interface PrivilegeMap {
  [key: string]: { mode: Mode; maskPattern?: string };
}

/** Resolved privilege for one registry target. */
export interface ResolvedPrivilege {
  level: TargetLevel;
  targetId: string;
  mode: Mode;
  maskPattern?: string;
  requiresApproval?: boolean;
}

interface RegistryTarget {
  level: TargetLevel;
  targetId: string;
  defaultMaskPattern?: string | null;
}

interface GrantLike {
  targetLevel: string;
  targetId: string;
  mode: string;
  maskPattern?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  conditionExpr?: string | null;
}

const RECORD_SCOPE_ORDER: Mode[] = ['OWN', 'TEAM', 'DEPARTMENT', 'BRANCH', 'ALL'];

const MODE_LADDERS: Partial<Record<TargetLevel, Mode[]>> = {
  MENU_ITEM: ['HIDDEN', 'VISIBLE'],
  MODULE: ['NO_ACCESS', 'VIEW', 'EDIT'],
  FORM: ['NO_ACCESS', 'VIEW', 'EDIT'],
  TAB: ['HIDDEN', 'COLLAPSED', 'VIEW', 'EDIT'],
  SECTION: ['HIDDEN', 'COLLAPSED', 'VIEW', 'EDIT'],
  FIELD: ['HIDDEN', 'MASKED', 'VIEW', 'EDIT', 'REQUIRED', 'OPTIONAL'],
  BUTTON: ['HIDDEN', 'DISABLED', 'VISIBLE'],
  LIST_COLUMN: ['HIDDEN', 'MASKED', 'VISIBLE'],
  LIST_FILTER: ['HIDDEN', 'VISIBLE'],
  BULK_ACTION: ['DENY', 'ALLOW_WITH_APPROVAL', 'ALLOW'],
  ACTION: ['DENY', 'NO_ACCESS', 'ALLOW_WITH_APPROVAL', 'ALLOW'],
  STATUS_TRANSITION: ['DENY', 'ALLOW_WITH_APPROVAL', 'ALLOW'],
  RECORD_SCOPE: RECORD_SCOPE_ORDER,
  REPORT: ['HIDDEN', 'VIEW', 'EXPORT'],
  DASHBOARD_WIDGET: ['HIDDEN', 'VISIBLE'],
};

const SUPER_ADMIN_MODES: Record<TargetLevel, Mode> = {
  MENU_ITEM: 'VISIBLE',
  MODULE: 'EDIT',
  FORM: 'EDIT',
  TAB: 'EDIT',
  SECTION: 'EDIT',
  FIELD: 'EDIT',
  BUTTON: 'VISIBLE',
  LIST_COLUMN: 'VISIBLE',
  LIST_FILTER: 'VISIBLE',
  BULK_ACTION: 'ALLOW',
  ACTION: 'ALLOW',
  STATUS_TRANSITION: 'ALLOW',
  RECORD_SCOPE: 'ALL',
  REPORT: 'EXPORT',
  DASHBOARD_WIDGET: 'VISIBLE',
};

/**
 * Rebuilds EffectivePrivilege rows for one user across every registry target.
 *
 * @param userId - User whose privileges should be recomputed.
 * @returns Full list of resolved privileges.
 */
export async function resolveAllForUser(userId: string): Promise<ResolvedPrivilege[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  const targets = await loadRegistryTargets();
  const resolved: ResolvedPrivilege[] = [];

  if (user.isSuperAdmin) {
    for (const target of targets) {
      const mode = SUPER_ADMIN_MODES[target.level];
      resolved.push({
        level: target.level,
        targetId: target.targetId,
        mode,
        maskPattern: target.defaultMaskPattern ?? undefined,
        requiresApproval: false,
      });
    }
  } else {
    const roleIds = await collectUserRoleIds(userId);
    const roleGrants = await loadRoleGrants(roleIds);
    const overrides = await loadUserOverrides(userId);

    for (const target of targets) {
      let mode = registryDefault(target.level);
      let maskPattern = target.defaultMaskPattern ?? undefined;

      const applicableGrants = roleGrants.filter(
        (g) => g.targetLevel === target.level && g.targetId === target.targetId,
      );

      for (const grant of applicableGrants) {
        const merged = mergeModes(target.level, mode, grant.mode as Mode, maskPattern, grant.maskPattern);
        mode = merged.mode;
        maskPattern = merged.maskPattern;
      }

      const override = overrides.find(
        (o) => o.targetLevel === target.level && o.targetId === target.targetId,
      );
      if (override) {
        const applied = applyOverride(target.level, mode, override.mode as Mode, maskPattern, override.maskPattern);
        mode = applied.mode;
        maskPattern = applied.maskPattern;
      }

      resolved.push({
        level: target.level,
        targetId: target.targetId,
        mode,
        maskPattern,
        requiresApproval: mode === 'ALLOW_WITH_APPROVAL',
      });
    }
  }

  await upsertEffectivePrivileges(userId, resolved);
  return resolved;
}

/**
 * Resolves a single privilege from the EffectivePrivilege cache.
 * Triggers a full recompute when the cache row is missing.
 *
 * @param userId - Authenticated user id.
 * @param level - Target level.
 * @param targetId - Registry target code.
 */
export async function resolveOne(
  userId: string,
  level: TargetLevel,
  targetId: string,
): Promise<{ mode: Mode; maskPattern?: string }> {
  let cached = await prisma.effectivePrivilege.findUnique({
    where: {
      userId_targetLevel_targetId: { userId, targetLevel: level, targetId },
    },
  });

  if (!cached) {
    await resolveAllForUser(userId);
    cached = await prisma.effectivePrivilege.findUnique({
      where: {
        userId_targetLevel_targetId: { userId, targetLevel: level, targetId },
      },
    });
  }

  if (!cached) {
    return { mode: registryDefault(level) };
  }

  return {
    mode: cached.mode as Mode,
    maskPattern: cached.maskPattern ?? undefined,
  };
}

/**
 * Evaluates conditional grants against a record and returns the effective mode.
 *
 * @param userId - Authenticated user id.
 * @param level - Target level.
 * @param targetId - Registry target code.
 * @param record - Record context for conditionExpr evaluation.
 */
export async function resolveForRecord(
  userId: string,
  level: TargetLevel,
  targetId: string,
  record: Record<string, unknown>,
): Promise<Mode> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 'NO_ACCESS';
  if (user.isSuperAdmin) return SUPER_ADMIN_MODES[level];

  const base = await resolveOne(userId, level, targetId);
  let mode = base.mode;

  const roleIds = await collectUserRoleIds(userId);
  const grants = (await loadRoleGrants(roleIds)).filter(
    (g) => g.targetLevel === level && g.targetId === targetId && g.conditionExpr,
  );

  for (const grant of grants) {
    if (!evaluateCondition(grant.conditionExpr!, record)) continue;
    const merged = mergeModes(level, mode, grant.mode as Mode, undefined, grant.maskPattern);
    mode = merged.mode;
  }

  return mode;
}

/** Returns the most restrictive default mode for a target level. */
export function registryDefault(level: TargetLevel): Mode {
  switch (level) {
    case 'MENU_ITEM':
    case 'TAB':
    case 'SECTION':
    case 'FIELD':
    case 'BUTTON':
    case 'LIST_COLUMN':
    case 'LIST_FILTER':
    case 'REPORT':
    case 'DASHBOARD_WIDGET':
      return 'HIDDEN';
    case 'MODULE':
    case 'FORM':
      return 'NO_ACCESS';
    case 'BULK_ACTION':
    case 'ACTION':
    case 'STATUS_TRANSITION':
      return 'NO_ACCESS';
    case 'RECORD_SCOPE':
      return 'OWN';
    default:
      return 'HIDDEN';
  }
}

/**
 * Permissive union merge: higher rank wins. Explicit `DENY` from a grant always wins;
 * registry defaults use `NO_ACCESS` so role grants can elevate to `ALLOW`.
 */
export function mergeModes(
  level: TargetLevel,
  current: Mode,
  incoming: Mode,
  currentMask?: string,
  incomingMask?: string | null,
): { mode: Mode; maskPattern?: string } {
  if (incoming === 'DENY') {
    return { mode: 'DENY', maskPattern: incomingMask ?? currentMask };
  }
  if (current === 'DENY') {
    return { mode: 'DENY', maskPattern: currentMask };
  }

  if (level === 'RECORD_SCOPE') {
    const winner = broaderRecordScope(current, incoming);
    return { mode: winner, maskPattern: currentMask };
  }

  const ladder = MODE_LADDERS[level] ?? [];
  const currentRank = ladder.indexOf(current);
  const incomingRank = ladder.indexOf(incoming);

  if (currentRank === -1 && incomingRank === -1) {
    return { mode: incoming, maskPattern: pickMask(current, incoming, currentMask, incomingMask) };
  }
  if (currentRank === -1) {
    return { mode: incoming, maskPattern: pickMask(current, incoming, currentMask, incomingMask) };
  }
  if (incomingRank === -1) {
    return { mode: current, maskPattern: currentMask };
  }

  const winner = incomingRank >= currentRank ? incoming : current;
  return { mode: winner, maskPattern: pickMask(current, incoming, currentMask, incomingMask) };
}

/** User overrides replace the merged role result for that target. */
export function applyOverride(
  level: TargetLevel,
  _current: Mode,
  override: Mode,
  _currentMask?: string,
  overrideMask?: string | null,
): { mode: Mode; maskPattern?: string } {
  if (override === 'DENY') {
    return { mode: 'DENY', maskPattern: overrideMask ?? undefined };
  }
  return { mode: override, maskPattern: overrideMask ?? undefined };
}

function broaderRecordScope(a: Mode, b: Mode): Mode {
  const rank = (mode: Mode) => {
    const idx = RECORD_SCOPE_ORDER.indexOf(mode);
    return idx === -1 ? -1 : idx;
  };
  return rank(a) >= rank(b) ? a : b;
}

function pickMask(
  current: Mode,
  incoming: Mode,
  currentMask?: string,
  incomingMask?: string | null,
): string | undefined {
  if (incoming === 'MASKED') return incomingMask ?? currentMask;
  if (current === 'MASKED') return currentMask;
  return incomingMask ?? currentMask;
}

function isTimeBoundActive(validFrom?: Date | null, validUntil?: Date | null, now = new Date()): boolean {
  if (validFrom && now < validFrom) return false;
  if (validUntil && now > validUntil) return false;
  return true;
}

async function collectUserRoleIds(userId: string): Promise<string[]> {
  const now = new Date();
  const assignments = await prisma.userRole.findMany({ where: { userId } });
  const directRoleIds = assignments
    .filter((a) => isTimeBoundActive(a.validFrom, a.validUntil, now))
    .map((a) => a.roleId);

  const allRoleIds = new Set<string>();
  const queue = [...directRoleIds];

  while (queue.length > 0) {
    const roleId = queue.shift()!;
    if (allRoleIds.has(roleId)) continue;
    allRoleIds.add(roleId);

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { parentRoleId: true },
    });
    if (role?.parentRoleId) queue.push(role.parentRoleId);
  }

  return Array.from(allRoleIds);
}

/**
 * Builds a flat privilege map for client consumption (`GET /api/me/privileges`).
 *
 * @param userId - User whose privileges should be loaded.
 */
export async function buildPrivilegeMap(userId: string): Promise<PrivilegeMap> {
  const resolved = await resolveAllForUser(userId);
  const map: PrivilegeMap = {};
  for (const item of resolved) {
    map[`${item.level}:${item.targetId}`] = {
      mode: item.mode,
      maskPattern: item.maskPattern,
    };
  }
  return map;
}

/** Alias used by pg-boss privilege recompute jobs. */
export async function recomputeEffectivePrivileges(userId: string): Promise<ResolvedPrivilege[]> {
  return resolveAllForUser(userId);
}

async function loadRoleGrants(roleIds: string[]): Promise<GrantLike[]> {
  if (roleIds.length === 0) return [];
  const now = new Date();
  const grants = await prisma.rolePrivilegeGrant.findMany({
    where: { roleId: { in: roleIds } },
  });
  return grants.filter((g) => isTimeBoundActive(g.validFrom, g.validUntil, now));
}

async function loadUserOverrides(userId: string): Promise<GrantLike[]> {
  const now = new Date();
  const overrides = await prisma.userPrivilegeOverride.findMany({ where: { userId } });
  return overrides.filter((o) => isTimeBoundActive(o.validFrom, o.validUntil, now));
}

async function loadRegistryTargets(): Promise<RegistryTarget[]> {
  const [
    menuItems,
    modules,
    forms,
    tabs,
    sections,
    fields,
    buttons,
    listColumns,
    listFilters,
    actions,
    bulkActions,
    transitions,
    scopes,
    reports,
    widgets,
  ] = await Promise.all([
    prisma.menuItem.findMany({ select: { code: true } }),
    prisma.module.findMany({ select: { id: true, code: true } }),
    prisma.form.findMany({ select: { code: true } }),
    prisma.tab.findMany({ select: { code: true } }),
    prisma.section.findMany({ select: { code: true } }),
    prisma.field.findMany({ select: { code: true, defaultMaskPattern: true } }),
    prisma.button.findMany({ select: { code: true } }),
    prisma.listColumnDef.findMany({ select: { code: true, defaultMaskPattern: true } }),
    prisma.listFilterDef.findMany({ select: { code: true } }),
    prisma.actionDef.findMany({ select: { code: true } }),
    prisma.bulkActionDef.findMany({ select: { code: true } }),
    prisma.statusTransitionDef.findMany({ select: { code: true } }),
    prisma.recordScopeDef.findMany({ select: { code: true, module: { select: { code: true } } } }),
    prisma.reportDef.findMany({ select: { code: true } }),
    prisma.dashboardWidgetDef.findMany({ select: { code: true } }),
  ]);

  const targets: RegistryTarget[] = [];

  for (const item of menuItems) targets.push({ level: 'MENU_ITEM', targetId: item.code });
  for (const mod of modules) targets.push({ level: 'MODULE', targetId: mod.code });
  for (const form of forms) targets.push({ level: 'FORM', targetId: form.code });
  for (const tab of tabs) targets.push({ level: 'TAB', targetId: tab.code });
  for (const section of sections) targets.push({ level: 'SECTION', targetId: section.code });
  for (const field of fields) {
    targets.push({
      level: 'FIELD',
      targetId: field.code,
      defaultMaskPattern: field.defaultMaskPattern,
    });
  }
  for (const button of buttons) targets.push({ level: 'BUTTON', targetId: button.code });
  for (const column of listColumns) {
    targets.push({
      level: 'LIST_COLUMN',
      targetId: column.code,
      defaultMaskPattern: column.defaultMaskPattern,
    });
  }
  for (const filter of listFilters) targets.push({ level: 'LIST_FILTER', targetId: filter.code });
  for (const action of actions) targets.push({ level: 'ACTION', targetId: action.code });
  for (const bulk of bulkActions) targets.push({ level: 'BULK_ACTION', targetId: bulk.code });
  for (const transition of transitions) {
    targets.push({ level: 'STATUS_TRANSITION', targetId: transition.code });
  }
  for (const scope of scopes) {
    targets.push({ level: 'RECORD_SCOPE', targetId: scope.module.code });
  }
  for (const report of reports) targets.push({ level: 'REPORT', targetId: report.code });
  for (const widget of widgets) targets.push({ level: 'DASHBOARD_WIDGET', targetId: widget.code });

  return targets;
}

async function upsertEffectivePrivileges(userId: string, resolved: ResolvedPrivilege[]): Promise<void> {
  const computedAt = new Date();

  await prisma.$transaction(
    resolved.map((item) =>
      prisma.effectivePrivilege.upsert({
        where: {
          userId_targetLevel_targetId: {
            userId,
            targetLevel: item.level,
            targetId: item.targetId,
          },
        },
        create: {
          userId,
          targetLevel: item.level,
          targetId: item.targetId,
          mode: item.mode,
          maskPattern: item.maskPattern,
          computedAt,
        },
        update: {
          mode: item.mode,
          maskPattern: item.maskPattern,
          computedAt,
        },
      }),
    ),
  );
}

/**
 * Safely evaluates simple condition expressions against a record.
 * Supports: record.field == 'VALUE', record.field != 'VALUE', record.field === true|false
 */
export function evaluateCondition(expr: string, record: Record<string, unknown>): boolean {
  const trimmed = expr.trim();
  const eqMatch = trimmed.match(/^record\.(\w+)\s*===?\s*['"]([^'"]*)['"]$/);
  if (eqMatch) {
    const [, field, expected] = eqMatch;
    return String(record[field] ?? '') === expected;
  }

  const neqMatch = trimmed.match(/^record\.(\w+)\s*!==?\s*['"]([^'"]*)['"]$/);
  if (neqMatch) {
    const [, field, expected] = neqMatch;
    return String(record[field] ?? '') !== expected;
  }

  const boolMatch = trimmed.match(/^record\.(\w+)\s*===?\s*(true|false)$/i);
  if (boolMatch) {
    const [, field, expected] = boolMatch;
    return Boolean(record[field]) === (expected.toLowerCase() === 'true');
  }

  return false;
}
