import { describe, expect, it } from 'vitest';
import { mergeModes, registryDefault, type Mode } from '@/lib/privilege/resolver';

describe('privilege resolver', () => {
  it('should_default_actions_to_no_access_not_deny', () => {
    expect(registryDefault('ACTION')).toBe('NO_ACCESS');
    expect(registryDefault('BULK_ACTION')).toBe('NO_ACCESS');
    expect(registryDefault('STATUS_TRANSITION')).toBe('NO_ACCESS');
  });

  it('should_allow_grant_to_elevate_from_default_no_access', () => {
    const result = mergeModes('ACTION', 'NO_ACCESS', 'ALLOW');
    expect(result.mode).toBe('ALLOW');
  });

  it('should_keep_deny_when_explicit_deny_grant_applied_after_allow', () => {
    let mode = registryDefault('ACTION');
    mode = mergeModes('ACTION', mode, 'ALLOW').mode;
    mode = mergeModes('ACTION', mode, 'DENY').mode;
    expect(mode).toBe('DENY');
  });

  it('should_block_allow_after_explicit_deny', () => {
    let mode: Mode = 'DENY';
    mode = mergeModes('ACTION', mode, 'ALLOW').mode;
    expect(mode).toBe('DENY');
  });
});
