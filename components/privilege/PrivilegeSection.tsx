'use client';

import type { ReactNode } from 'react';
import { useSectionMode } from '@/lib/privilege/usePrivilege';

interface PrivilegeSectionProps {
  code: string;
  title?: string;
  children: ReactNode;
}

/**
 * Renders a form section when the user has at least VIEW access.
 */
export function PrivilegeSection({ code, title, children }: PrivilegeSectionProps) {
  const mode = useSectionMode(code);

  if (mode === 'HIDDEN' || mode === 'NO_ACCESS') return null;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      {title && <h3 className="text-lg font-semibold">{title}</h3>}
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
