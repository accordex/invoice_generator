'use client';

import type { ComponentProps } from 'react';
import { useState } from 'react';
import { useCanDo } from '@/lib/privilege/usePrivilege';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/api/client';

interface RequireApprovalButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  action: string;
  targetLevel?: string;
  targetId?: string;
  recordType?: string;
  recordId?: string;
  payload?: Record<string, unknown>;
  onClick?: () => void | Promise<void>;
}

/**
 * Executes an action directly when allowed, or submits an approval request when required.
 */
export function RequireApprovalButton({
  action,
  targetLevel = 'ACTION',
  targetId,
  recordType,
  recordId,
  payload,
  onClick,
  children,
  disabled,
  ...props
}: RequireApprovalButtonProps) {
  const { allowed, requiresApproval } = useCanDo(action);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!allowed && !requiresApproval) return null;

  const handleClick = async () => {
    if (requiresApproval) {
      setLoading(true);
      try {
        await apiFetch('/api/me/approval-requests', {
          method: 'POST',
          body: JSON.stringify({
            targetLevel,
            targetId: targetId ?? action,
            recordType,
            recordId,
            payload,
          }),
        });
        toast({
          title: 'Approval requested',
          description: 'Your request has been submitted for review.',
        });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Request failed',
          description: err instanceof Error ? err.message : 'Could not submit approval request',
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await onClick?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button {...props} disabled={disabled || loading} onClick={handleClick}>
      {loading ? 'Please wait…' : children}
      {requiresApproval && !loading ? ' (needs approval)' : null}
    </Button>
  );
}
