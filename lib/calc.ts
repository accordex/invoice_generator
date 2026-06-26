/** Input for a single invoice line calculation. */
export interface LineInput {
  qty: number;
  rate: number;
  discountPct: number;
  taxPct: number;
}

/** Computed amounts for a single invoice line. */
export interface LineResult {
  gross: number;
  discountAmt: number;
  taxableValue: number;
  taxAmt: number;
  lineTotal: number;
}

/** Options for invoice-level aggregation and GST split. */
export interface InvoiceCalcOpts {
  customerState: string;
  companyState: string;
  shipping: number;
  roundOff: number;
}

/** Full invoice calculation result. */
export interface InvoiceCalcResult {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  shippingCharges: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
}

/** Rounds a number to two decimal places using standard half-up rounding. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Calculates monetary values for a single invoice line item.
 * Handles zero qty/rate, fractional quantities, and 100% discount.
 */
export function calcLine({ qty, rate, discountPct, taxPct }: LineInput): LineResult {
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safeRate = Number.isFinite(rate) ? rate : 0;
  const safeDiscount = Math.min(100, Math.max(0, Number.isFinite(discountPct) ? discountPct : 0));
  const safeTax = Math.max(0, Number.isFinite(taxPct) ? taxPct : 0);

  const gross = round2(safeQty * safeRate);
  const discountAmt = round2(gross * (safeDiscount / 100));
  const taxableValue = round2(Math.max(0, gross - discountAmt));
  const taxAmt = round2(taxableValue * (safeTax / 100));
  const lineTotal = round2(taxableValue + taxAmt);

  return { gross, discountAmt, taxableValue, taxAmt, lineTotal };
}

/**
 * Splits total tax into CGST/SGST (intra-state) or IGST (inter-state).
 */
export function gstSplit(
  taxAmt: number,
  companyState: string,
  customerState: string,
): { cgst: number; sgst: number; igst: number } {
  const tax = round2(taxAmt);
  const normalizedCompany = companyState.trim().toLowerCase();
  const normalizedCustomer = customerState.trim().toLowerCase();

  if (normalizedCompany && normalizedCustomer && normalizedCompany === normalizedCustomer) {
    const half = round2(tax / 2);
    const remainder = round2(tax - half);
    return { cgst: half, sgst: remainder, igst: 0 };
  }

  return { cgst: 0, sgst: 0, igst: tax };
}

/**
 * Aggregates line items into invoice totals with GST split and amount in words.
 * Supports mixed tax rates, negative round-off, and large INR amounts.
 */
export function calcInvoice(lines: LineInput[], opts: InvoiceCalcOpts): InvoiceCalcResult {
  const lineResults = (lines ?? []).map(calcLine);

  const subtotal = round2(lineResults.reduce((sum, line) => sum + line.gross, 0));
  const totalDiscount = round2(lineResults.reduce((sum, line) => sum + line.discountAmt, 0));
  const taxableAmount = round2(lineResults.reduce((sum, line) => sum + line.taxableValue, 0));
  const totalTax = round2(lineResults.reduce((sum, line) => sum + line.taxAmt, 0));

  const { cgst, sgst, igst } = gstSplit(totalTax, opts.companyState, opts.customerState);
  const shippingCharges = round2(Number.isFinite(opts.shipping) ? opts.shipping : 0);
  const roundOff = round2(Number.isFinite(opts.roundOff) ? opts.roundOff : 0);
  const grandTotal = round2(taxableAmount + totalTax + shippingCharges + roundOff);
  const amountInWords = amountInWordsINR(grandTotal);

  return {
    subtotal,
    totalDiscount,
    taxableAmount,
    totalTax,
    cgst,
    sgst,
    igst,
    shippingCharges,
    roundOff,
    grandTotal,
    amountInWords,
  };
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const;

/** Converts a 0–99 integer to English words. */
function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? (TENS[tens] ?? '') : `${TENS[tens]} ${ONES[ones]}`.trim();
}

/** Converts a 0–999 integer to English words. */
function threeDigitWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  const parts: string[] = [];
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (remainder > 0) parts.push(twoDigitWords(remainder));
  return parts.join(' ').trim();
}

/**
 * Converts an integer (Indian grouping) to words using lakh/crore scales.
 * Supports values up to 99,99,99,999.
 */
function integerToWordsINR(n: number): string {
  if (n === 0) return 'Zero';

  const parts: string[] = [];

  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1_000);
  const hundredBlock = n % 1_000;

  if (crore > 0) parts.push(`${integerToWordsINR(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (hundredBlock > 0) parts.push(threeDigitWords(hundredBlock));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Converts an INR amount to words using Indian numbering (lakhs/crores).
 * Supports amounts from 0 up to 99,99,99,999.99.
 */
export function amountInWordsINR(amount: number): string {
  if (!Number.isFinite(amount)) {
    return 'Zero Rupees Only';
  }

  const capped = Math.min(Math.max(0, amount), 99_99_99_999.99);
  const rounded = round2(capped);
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const rupeeWords = integerToWordsINR(rupees);
  const paiseWords = paise > 0 ? `${integerToWordsINR(paise)} Paise` : '';

  if (paise > 0) {
    return `${rupeeWords} Rupees and ${paiseWords} Only`;
  }

  return `${rupeeWords} Rupees Only`;
}

/**
 * Formats a number in Indian locale style, e.g. 1,00,000.00.
 */
export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';

  const negative = amount < 0;
  const fixed = round2(Math.abs(amount)).toFixed(2);
  const [intPart, decPart] = fixed.split('.');

  let formattedInt: string;
  if (intPart.length <= 3) {
    formattedInt = intPart;
  } else {
    const lastThree = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    const groups: string[] = [lastThree];
    while (rest.length > 0) {
      if (rest.length <= 2) {
        groups.unshift(rest);
        break;
      }
      groups.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    formattedInt = groups.join(',');
  }

  return `${negative ? '-' : ''}${formattedInt}.${decPart}`;
}
