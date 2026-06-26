'use client';

import { useQuery } from '@tanstack/react-query';
import type { Mode } from './resolver';

export interface PrivilegeMap {
  [key: string]: { mode: Mode; maskPattern?: string };
}

function readMode(
  map: PrivilegeMap | undefined,
  level: string,
  code: string,
): { mode: Mode; maskPattern?: string } {
  return map?.[`${level}:${code}`] ?? { mode: 'HIDDEN' };
}

/** Reads a single mode from a privilege map without invoking a hook. */
export function getPrivilegeMode(
  map: PrivilegeMap | undefined,
  level: string,
  code: string,
): Mode {
  return readMode(map, level, code).mode;
}

/**
 * Loads the authenticated user's effective privilege map (cached 5 min).
 */
export function usePrivilegeMap() {
  return useQuery<PrivilegeMap>({
    queryKey: ['me', 'privileges'],
    queryFn: () => fetch('/api/me/privileges').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFieldMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'FIELD', code);
}

export function useSectionMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'SECTION', code).mode;
}

export function useTabMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'TAB', code).mode;
}

export function useButtonMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'BUTTON', code).mode;
}

export function useColumnMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'LIST_COLUMN', code);
}

export function useFilterMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'LIST_FILTER', code).mode;
}

export function useMenuMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'MENU_ITEM', code).mode;
}

export function useReportMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'REPORT', code).mode;
}

export function useWidgetMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'DASHBOARD_WIDGET', code).mode;
}

export function useModuleMode(code: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'MODULE', code).mode;
}

export function useScope(moduleCode: string) {
  const { data } = usePrivilegeMap();
  return readMode(data, 'RECORD_SCOPE', moduleCode).mode;
}

export function useCanDo(action: string) {
  const { data } = usePrivilegeMap();
  const { mode } = readMode(data, 'ACTION', action);
  return { allowed: mode === 'ALLOW', requiresApproval: mode === 'ALLOW_WITH_APPROVAL' };
}

export function useCanTransition(code: string) {
  const { data } = usePrivilegeMap();
  const { mode } = readMode(data, 'STATUS_TRANSITION', code);
  return { allowed: mode === 'ALLOW', requiresApproval: mode === 'ALLOW_WITH_APPROVAL' };
}

export function useCanBulk(code: string) {
  const { data } = usePrivilegeMap();
  const { mode } = readMode(data, 'BULK_ACTION', code);
  return { allowed: mode === 'ALLOW', requiresApproval: mode === 'ALLOW_WITH_APPROVAL' };
}
