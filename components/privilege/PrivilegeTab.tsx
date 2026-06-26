'use client';

import type { ReactNode } from 'react';
import { useTabMode } from '@/lib/privilege/usePrivilege';
import { TabsContent, TabsTrigger } from '@/components/ui/tabs';

interface PrivilegeTabProps {
  code: string;
  label: string;
  value: string;
  children: ReactNode;
}

/**
 * Tab trigger + content pair gated by TAB privilege.
 */
export function PrivilegeTab({ code, label, value, children }: PrivilegeTabProps) {
  const mode = useTabMode(code);

  if (mode === 'HIDDEN' || mode === 'NO_ACCESS') return null;

  return (
    <>
      <TabsTrigger value={value}>{label}</TabsTrigger>
      <TabsContent value={value}>{children}</TabsContent>
    </>
  );
}
