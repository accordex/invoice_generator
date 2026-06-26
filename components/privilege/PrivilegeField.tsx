'use client';

import type { ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import { useFieldMode } from '@/lib/privilege/usePrivilege';
import { Label } from '@/components/ui/label';
import { MaskedValue } from '@/components/shared/MaskedValue';

interface PrivilegeFieldProps {
  code: string;
  label?: string;
  defaultRequired?: boolean;
  children: ReactNode;
}

/**
 * Wraps a form field with privilege-driven visibility, read-only, required, and mask behaviour.
 */
export function PrivilegeField({ code, label, defaultRequired, children }: PrivilegeFieldProps) {
  const { mode, maskPattern } = useFieldMode(code);

  if (mode === 'HIDDEN' || mode === 'NO_ACCESS') return null;

  const required = mode === 'REQUIRED' || (defaultRequired && mode !== 'OPTIONAL');
  const readOnly = mode === 'VIEW' || mode === 'MASKED';
  const showMask = mode === 'MASKED';

  if (showMask && isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    const value = childProps.value ?? childProps.defaultValue;
    return (
      <div className="space-y-2">
        {label && (
          <Label>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
        )}
        <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm">
          <MaskedValue value={value as string | number} pattern={maskPattern} />
        </div>
      </div>
    );
  }

  const enhanced = isValidElement(children)
    ? cloneElement(children, {
        disabled: readOnly || (children.props as { disabled?: boolean }).disabled,
        readOnly: readOnly || (children.props as { readOnly?: boolean }).readOnly,
        required,
        'aria-required': required,
      } as Record<string, unknown>)
    : children;

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={(children as { props?: { id?: string } })?.props?.id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      {enhanced}
    </div>
  );
}
