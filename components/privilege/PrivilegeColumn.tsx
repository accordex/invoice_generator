'use client';

import type { ReactNode } from 'react';
import { useColumnMode } from '@/lib/privilege/usePrivilege';
import { MaskedValue } from '@/components/shared/MaskedValue';

interface PrivilegeColumnProps {
  code: string;
  value: string | number | null | undefined;
  children?: ReactNode;
}

/**
 * Table cell content with column-level masking support.
 */
export function PrivilegeColumn({ code, value, children }: PrivilegeColumnProps) {
  const { mode, maskPattern } = useColumnMode(code);

  if (mode === 'HIDDEN') return null;

  if (mode === 'MASKED' || maskPattern) {
    return <MaskedValue value={value} pattern={maskPattern} />;
  }

  return <>{children ?? value ?? '—'}</>;
}
