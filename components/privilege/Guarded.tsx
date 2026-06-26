'use client';

import type { ReactNode } from 'react';
import { getPrivilegeMode, usePrivilegeMap } from '@/lib/privilege/usePrivilege';

interface GuardedProps {
  children: ReactNode;
  module?: string;
  min?: 'VIEW' | 'EDIT';
  action?: string;
  field?: string;
  menu?: string;
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on module, action, field, or menu privilege.
 */
export function Guarded({
  children,
  module,
  min = 'VIEW',
  action,
  field,
  menu,
  fallback = null,
}: GuardedProps) {
  const { data: privilegeMap } = usePrivilegeMap();

  if (menu) {
    const mode = getPrivilegeMode(privilegeMap, 'MENU_ITEM', menu);
    if (mode === 'HIDDEN') return <>{fallback}</>;
    return <>{children}</>;
  }

  if (field) {
    const mode = getPrivilegeMode(privilegeMap, 'FIELD', field);
    if (mode === 'HIDDEN' || mode === 'NO_ACCESS') return <>{fallback}</>;
    return <>{children}</>;
  }

  if (action) {
    const mode = getPrivilegeMode(privilegeMap, 'ACTION', action);
    const allowed = mode === 'ALLOW';
    const requiresApproval = mode === 'ALLOW_WITH_APPROVAL';
    if (!allowed && !requiresApproval) return <>{fallback}</>;
    return <>{children}</>;
  }

  if (module) {
    const mode = getPrivilegeMode(privilegeMap, 'MODULE', module);
    if (mode === 'NO_ACCESS') return <>{fallback}</>;
    if (min === 'EDIT' && mode !== 'EDIT') return <>{fallback}</>;
    return <>{children}</>;
  }

  return <>{children}</>;
}
