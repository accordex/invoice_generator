import { describe, expect, it } from 'vitest';
import {
  amountInWordsINR,
  calcInvoice,
  calcLine,
  formatINR,
  gstSplit,
  round2,
} from '@/lib/calc';

describe('round2', () => {
  it('should_round_to_two_decimal_places', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(1.004)).toBe(1);
  });

  it('should_return_zero_when_input_is_not_finite', () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('calcLine', () => {
  it('should_return_zeros_when_qty_and_rate_are_zero', () => {
    const result = calcLine({ qty: 0, rate: 100, discountPct: 10, taxPct: 18 });
    expect(result).toEqual({
      gross: 0,
      discountAmt: 0,
      taxableValue: 0,
      taxAmt: 0,
      lineTotal: 0,
    });
  });

  it('should_handle_fractional_quantities', () => {
    const result = calcLine({ qty: 2.5, rate: 100, discountPct: 0, taxPct: 18 });
    expect(result.gross).toBe(250);
    expect(result.taxAmt).toBe(45);
    expect(result.lineTotal).toBe(295);
  });

  it('should_apply_100_percent_discount_with_zero_taxable_value', () => {
    const result = calcLine({ qty: 5, rate: 200, discountPct: 100, taxPct: 18 });
    expect(result.discountAmt).toBe(1000);
    expect(result.taxableValue).toBe(0);
    expect(result.taxAmt).toBe(0);
    expect(result.lineTotal).toBe(0);
  });

  it('should_clamp_discount_pct_between_0_and_100', () => {
    const over = calcLine({ qty: 1, rate: 100, discountPct: 150, taxPct: 18 });
    const under = calcLine({ qty: 1, rate: 100, discountPct: -10, taxPct: 18 });
    expect(over.discountAmt).toBe(100);
    expect(under.discountAmt).toBe(0);
  });

  it('should_treat_non_finite_inputs_as_safe_defaults', () => {
    const result = calcLine({ qty: Number.NaN, rate: Number.NaN, discountPct: Number.NaN, taxPct: Number.NaN });
    expect(result.gross).toBe(0);
    expect(result.lineTotal).toBe(0);
  });
});

describe('gstSplit', () => {
  it('should_split_tax_into_cgst_and_sgst_for_intra_state', () => {
    const result = gstSplit(180, 'Karnataka', 'Karnataka');
    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
    expect(result.igst).toBe(0);
  });

  it('should_assign_full_tax_to_igst_for_inter_state', () => {
    const result = gstSplit(180, 'Karnataka', 'Tamil Nadu');
    expect(result).toEqual({ cgst: 0, sgst: 0, igst: 180 });
  });

  it('should_handle_case_insensitive_state_comparison', () => {
    const result = gstSplit(100, '  karnataka ', 'KARNATAKA');
    expect(result.cgst + result.sgst).toBe(100);
    expect(result.igst).toBe(0);
  });

  it('should_use_igst_when_either_state_is_missing', () => {
    expect(gstSplit(50, '', 'Karnataka').igst).toBe(50);
    expect(gstSplit(50, 'Karnataka', '').igst).toBe(50);
  });
});

describe('calcInvoice', () => {
  it('should_aggregate_mixed_tax_rate_lines', () => {
    const result = calcInvoice(
      [
        { qty: 1, rate: 1000, discountPct: 0, taxPct: 18 },
        { qty: 2, rate: 500, discountPct: 10, taxPct: 5 },
      ],
      { customerState: 'Karnataka', companyState: 'Karnataka', shipping: 50, roundOff: 0 },
    );

    expect(result.subtotal).toBe(2000);
    expect(result.totalDiscount).toBe(100);
    expect(result.taxableAmount).toBe(1900);
    expect(result.totalTax).toBe(225);
    expect(result.cgst).toBe(112.5);
    expect(result.sgst).toBe(112.5);
    expect(result.grandTotal).toBe(2175);
  });

  it('should_apply_negative_round_off', () => {
    const result = calcInvoice(
      [{ qty: 1, rate: 999.99, discountPct: 0, taxPct: 0 }],
      { customerState: 'Karnataka', companyState: 'Karnataka', shipping: 0, roundOff: -0.99 },
    );
    expect(result.grandTotal).toBe(999);
  });

  it('should_handle_empty_line_array', () => {
    const result = calcInvoice([], {
      customerState: 'Karnataka',
      companyState: 'Karnataka',
      shipping: 0,
      roundOff: 0,
    });
    expect(result.grandTotal).toBe(0);
    expect(result.amountInWords).toBe('Zero Rupees Only');
  });

  it('should_compute_inter_state_igst_on_invoice_total', () => {
    const result = calcInvoice(
      [{ qty: 10, rate: 100, discountPct: 0, taxPct: 18 }],
      { customerState: 'Tamil Nadu', companyState: 'Karnataka', shipping: 0, roundOff: 0 },
    );
    expect(result.igst).toBe(180);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });
});

describe('amountInWordsINR', () => {
  it('should_convert_zero_and_small_amounts', () => {
    expect(amountInWordsINR(0)).toBe('Zero Rupees Only');
    expect(amountInWordsINR(1)).toBe('One Rupees Only');
  });

  it('should_include_paise_when_present', () => {
    expect(amountInWordsINR(1234.56)).toBe('One Thousand Two Hundred Thirty Four Rupees and Fifty Six Paise Only');
  });

  it('should_use_indian_grouping_for_lakhs_and_crores', () => {
    expect(amountInWordsINR(1_00_000)).toBe('One Lakh Rupees Only');
    expect(amountInWordsINR(1_00_00_000)).toBe('One Crore Rupees Only');
  });

  it('should_cap_amounts_above_supported_maximum', () => {
    const words = amountInWordsINR(1_00_00_00_000);
    expect(words).toContain('Crore');
    expect(words.endsWith('Only')).toBe(true);
  });

  it('should_return_zero_rupees_for_non_finite_input', () => {
    expect(amountInWordsINR(Number.NaN)).toBe('Zero Rupees Only');
  });
});

describe('formatINR', () => {
  it('should_format_using_indian_locale_grouping', () => {
    expect(formatINR(1_00_000.5)).toBe('1,00,000.50');
    expect(formatINR(12_34_56_789.1)).toBe('12,34,56,789.10');
  });

  it('should_prefix_negative_sign', () => {
    expect(formatINR(-1234.5)).toBe('-1,234.50');
  });

  it('should_return_zero_for_non_finite_input', () => {
    expect(formatINR(Number.POSITIVE_INFINITY)).toBe('0.00');
  });
});
