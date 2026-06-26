'use client';

import type { ComponentProps } from 'react';
import { useButtonMode } from '@/lib/privilege/usePrivilege';
import { Button } from '@/components/ui/button';

interface PrivilegeButtonProps extends ComponentProps<typeof Button> {
  code: string;
}

/**
 * Button gated by BUTTON privilege — hidden or disabled when not permitted.
 */
export function PrivilegeButton({ code, children, disabled, asChild, ...props }: PrivilegeButtonProps) {
  const mode = useButtonMode(code);

  if (mode === 'HIDDEN') return null;

  return (
    <Button {...props} asChild={asChild} disabled={disabled || mode === 'DISABLED'}>
      {children}
    </Button>
  );
}
