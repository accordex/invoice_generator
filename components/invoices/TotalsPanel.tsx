'use client';

import type { InvoiceCalcResult } from '@/lib/calc';
import { formatCurrencyINR } from '@/lib/format';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeSection } from '@/components/privilege/PrivilegeSection';
import { Input } from '@/components/ui/input';

interface TotalsPanelProps {
  totals: InvoiceCalcResult;
  shipping: number;
  roundOff: number;
  onShippingChange?: (v: number) => void;
  onRoundOffChange?: (v: number) => void;
  readOnly?: boolean;
}

/**
 * Invoice totals summary panel with CGST/SGST/IGST breakdown.
 */
export function TotalsPanel({
  totals,
  shipping,
  roundOff,
  onShippingChange,
  onRoundOffChange,
  readOnly,
}: TotalsPanelProps) {
  return (
    <PrivilegeSection code="INVOICE_TOTALS" title="Totals">
      <div className="md:col-span-2">
        <dl className="ml-auto max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd><PrivilegeField code="INVOICE_SUBTOTAL">{formatCurrencyINR(totals.subtotal)}</PrivilegeField></dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd><PrivilegeField code="INVOICE_TOTAL_DISCOUNT">{formatCurrencyINR(totals.totalDiscount)}</PrivilegeField></dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Taxable Amount</dt>
            <dd><PrivilegeField code="INVOICE_TAXABLE">{formatCurrencyINR(totals.taxableAmount)}</PrivilegeField></dd>
          </div>
          {totals.cgst > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">CGST</dt>
              <dd><PrivilegeField code="INVOICE_CGST">{formatCurrencyINR(totals.cgst)}</PrivilegeField></dd>
            </div>
          )}
          {totals.sgst > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">SGST</dt>
              <dd><PrivilegeField code="INVOICE_SGST">{formatCurrencyINR(totals.sgst)}</PrivilegeField></dd>
            </div>
          )}
          {totals.igst > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IGST</dt>
              <dd><PrivilegeField code="INVOICE_IGST">{formatCurrencyINR(totals.igst)}</PrivilegeField></dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>
              <PrivilegeField code="INVOICE_SHIPPING">
                {readOnly ? (
                  formatCurrencyINR(shipping)
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-28 text-right"
                    value={shipping}
                    onChange={(e) => onShippingChange?.(Number(e.target.value))}
                  />
                )}
              </PrivilegeField>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Round Off</dt>
            <dd>
              <PrivilegeField code="INVOICE_ROUND_OFF">
                {readOnly ? (
                  formatCurrencyINR(roundOff)
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-28 text-right"
                    value={roundOff}
                    onChange={(e) => onRoundOffChange?.(Number(e.target.value))}
                  />
                )}
              </PrivilegeField>
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <dt>Grand Total</dt>
            <dd><PrivilegeField code="INVOICE_GRAND_TOTAL">{formatCurrencyINR(totals.grandTotal)}</PrivilegeField></dd>
          </div>
          <p className="text-xs text-muted-foreground">
            <PrivilegeField code="INVOICE_AMOUNT_IN_WORDS">{totals.amountInWords}</PrivilegeField>
          </p>
        </dl>
      </div>
    </PrivilegeSection>
  );
}
