import type { Mode, PrivilegeMap } from './resolver';
import { invoiceManifest } from './manifest';
import type { FormDef } from './types';

export type { PrivilegeMap };

/**
 * Applies field-level masking and removal rules to an API response payload.
 *
 * @param payload - Response object (mutated in place for efficiency).
 * @param formCode - Form code whose fields should be scrubbed.
 * @param privilegeMap - Resolved privilege map for the current user.
 * @returns Scrubbed payload with HIDDEN fields removed and MASKED values redacted.
 */
export function scrubResponse<T extends Record<string, unknown>>(
  payload: T,
  formCode: string,
  privilegeMap: PrivilegeMap,
): T {
  const fieldCodes = getFormFieldCodes(formCode);
  const result = { ...payload } as Record<string, unknown>;

  for (const fieldCode of fieldCodes) {
    const key = `FIELD:${fieldCode}`;
    const privilege = privilegeMap[key] ?? { mode: 'HIDDEN' as Mode };
    const payloadKey = fieldCodeToPayloadKey(fieldCode);

    if (!(payloadKey in result) && !(fieldCode in result)) continue;

    const dataKey = payloadKey in result ? payloadKey : fieldCode;

    if (privilege.mode === 'HIDDEN' || privilege.mode === 'NO_ACCESS') {
      delete result[dataKey];
      continue;
    }

    if (privilege.mode === 'MASKED') {
      const raw = result[dataKey];
      if (raw !== null && raw !== undefined) {
        result[dataKey] = applyMask(String(raw), privilege.maskPattern);
      }
    }
  }

  return result as T;
}

/**
 * Strips request body fields the user is not permitted to edit.
 *
 * @param body - Incoming request body.
 * @param formCode - Form code defining editable fields.
 * @param privilegeMap - Resolved privilege map for the current user.
 * @returns Sanitized body containing only EDIT-allowed fields.
 */
export function scrubRequest<T extends Record<string, unknown>>(
  body: T,
  formCode: string,
  privilegeMap: PrivilegeMap,
): Partial<T> {
  const fieldCodes = getFormFieldCodes(formCode);
  const result: Record<string, unknown> = { ...body };

  for (const fieldCode of fieldCodes) {
    const key = `FIELD:${fieldCode}`;
    const privilege = privilegeMap[key] ?? { mode: 'HIDDEN' as Mode };
    const payloadKey = fieldCodeToPayloadKey(fieldCode);
    const dataKey = payloadKey in result ? payloadKey : fieldCode;

    if (privilege.mode !== 'EDIT' && privilege.mode !== 'REQUIRED' && privilege.mode !== 'OPTIONAL') {
      delete result[dataKey];
    }
  }

  return result as Partial<T>;
}

/**
 * Applies a masking pattern to a string value.
 *
 * @param value - Raw string to mask.
 * @param pattern - Mask pattern identifier (MASK_LAST_4, MASK_MIDDLE, etc.).
 * @returns Masked string.
 */
export function applyMask(value: string, pattern?: string | null): string {
  if (!value) return value;
  const mask = pattern ?? 'MASK_FULL';

  switch (mask) {
    case 'MASK_NONE':
      return value;
    case 'MASK_LAST_4': {
      if (value.length <= 4) return '*'.repeat(value.length);
      return '*'.repeat(value.length - 4) + value.slice(-4);
    }
    case 'MASK_FIRST_4': {
      if (value.length <= 4) return '*'.repeat(value.length);
      return value.slice(0, 4) + '*'.repeat(value.length - 4);
    }
    case 'MASK_MIDDLE': {
      if (value.includes('@')) {
        const [local, domain] = value.split('@');
        if (!local || !domain) return '*'.repeat(value.length);
        const visible = local.charAt(0);
        return `${visible}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
      }
      if (value.length <= 2) return '*'.repeat(value.length);
      return value.charAt(0) + '*'.repeat(value.length - 2) + value.charAt(value.length - 1);
    }
    case 'MASK_INITIAL': {
      return value
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}.`)
        .join(' ');
    }
    case 'MASK_FULL':
      return '*'.repeat(Math.min(value.length, 10));
    default: {
      if (mask.startsWith('MASK_CUSTOM:')) {
        const parts = mask.split(':');
        if (parts.length >= 3) {
          const regexSource = parts[1];
          const replacement = parts.slice(2).join(':');
          try {
            const regex = new RegExp(regexSource);
            return value.replace(regex, replacement);
          } catch {
            return '*'.repeat(Math.min(value.length, 10));
          }
        }
      }
      return '*'.repeat(Math.min(value.length, 10));
    }
  }
}

function getFormFieldCodes(formCode: string): string[] {
  for (const mod of invoiceManifest.modules) {
    for (const form of mod.forms) {
      if (form.code !== formCode) continue;
      return collectFormFields(form);
    }
  }
  return [];
}

function collectFormFields(form: FormDef): string[] {
  const codes: string[] = [];
  const sections = [...(form.sections ?? [])];
  for (const tab of form.tabs ?? []) {
    sections.push(...tab.sections);
  }
  for (const section of sections) {
    for (const field of section.fields) {
      codes.push(field.code);
    }
  }
  return codes;
}

/** Maps manifest FIELD codes to typical camelCase API payload keys. */
function fieldCodeToPayloadKey(fieldCode: string): string {
  return fieldCode
    .toLowerCase()
    .replace(/^[a-z]+_/, (prefix) => {
      const map: Record<string, string> = {
        company_: '',
        customer_: '',
        product_: '',
        invoice_: '',
        line_item_: 'lineItem',
        user_: '',
      };
      for (const [key, replacement] of Object.entries(map)) {
        if (prefix === key) return replacement;
      }
      return '';
    })
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
