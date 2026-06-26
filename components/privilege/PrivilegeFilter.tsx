'use client';

import type { ReactNode } from 'react';
import { useFilterMode } from '@/lib/privilege/usePrivilege';

interface PrivilegeFilterProps {
  code: string;
  children: ReactNode;
}

/**
 * List filter control gated by LIST_FILTER privilege.
 */
export function PrivilegeFilter({ code, children }: PrivilegeFilterProps) {
  const mode = useFilterMode(code);

  if (mode === 'HIDDEN') return null;

  return <>{children}</>;
}
