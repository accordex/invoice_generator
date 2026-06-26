import { formatINR } from '@/lib/calc';

/**
 * Formats an amount as Indian Rupees with ₹ symbol and lakh grouping.
 */
export function formatCurrencyINR(amount: number): string {
  return `₹${formatINR(amount)}`;
}

/**
 * Formats a date for display in Indian locale.
 */
export function formatDateIN(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
