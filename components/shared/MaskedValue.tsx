'use client';

import { applyMask } from '@/lib/privilege/scrub';

interface MaskedValueProps {
  value: string | number | null | undefined;
  pattern?: string | null;
  className?: string;
}

/**
 * Renders a value with privilege-driven masking applied client-side.
 */
export function MaskedValue({ value, pattern, className }: MaskedValueProps) {
  if (value === null || value === undefined || value === '') {
    return <span className={className}>—</span>;
  }
  const text = String(value);
  const masked = pattern ? applyMask(text, pattern) : text;
  return <span className={className}>{masked}</span>;
}
