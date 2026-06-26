import { Prisma } from '@prisma/client';

/**
 * Converts Prisma Decimal fields to plain numbers for JSON responses.
 */
export function serializeDecimals<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Prisma.Decimal) {
        return v.toNumber();
      }
      return v;
    }),
  ) as T;
}

/**
 * Converts selected rows to CSV text.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const str = val == null ? '' : String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
