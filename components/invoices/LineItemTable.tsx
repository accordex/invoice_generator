'use client';

import { formatCurrencyINR } from '@/lib/format';
import { calcLine } from '@/lib/calc';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface LineItemRow {
  productId?: string | null;
  itemName: string;
  description?: string | null;
  hsnSac?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  discountPct: number;
  taxPct: 0 | 5 | 12 | 18 | 28;
}

interface LineItemTableProps {
  lines: LineItemRow[];
  products?: Array<{ id: string; name: string; unit: string; sellingPrice: number; taxRate: number; hsnSac?: string | null }>;
  onChange: (lines: LineItemRow[]) => void;
  readOnly?: boolean;
}

const TAX_RATES = [0, 5, 12, 18, 28] as const;

/**
 * Editable invoice line items table with live amount calculation.
 */
export function LineItemTable({ lines, products = [], onChange, readOnly }: LineItemTableProps) {
  const updateLine = (index: number, patch: Partial<LineItemRow>) => {
    const next = lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange(next);
  };

  const addLine = () => {
    onChange([
      ...lines,
      { itemName: '', quantity: 1, unit: 'Nos', rate: 0, discountPct: 0, taxPct: 18 },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, i) => i !== index));
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    updateLine(index, {
      productId,
      itemName: product.name,
      unit: product.unit,
      rate: Number(product.sellingPrice),
      taxPct: product.taxRate as LineItemRow['taxPct'],
      hsnSac: product.hsnSac,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Item</TableHead>
              <TableHead>HSN/SAC</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead className="w-20">Unit</TableHead>
              <TableHead className="w-28">Rate (₹)</TableHead>
              <TableHead className="w-20">Disc %</TableHead>
              <TableHead className="w-20">GST %</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {!readOnly && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const calc = calcLine({
                qty: line.quantity,
                rate: line.rate,
                discountPct: line.discountPct,
                taxPct: line.taxPct,
              });
              return (
                <TableRow key={index}>
                  <TableCell>
                    {readOnly ? (
                      line.itemName
                    ) : (
                      <div className="space-y-1">
                        {products.length > 0 && (
                          <Select value={line.productId ?? ''} onValueChange={(v) => selectProduct(index, v)}>
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <PrivilegeField code="LINE_ITEM_PRODUCT">
                          <Input
                            value={line.itemName}
                            onChange={(e) => updateLine(index, { itemName: e.target.value })}
                            placeholder="Item name"
                            className="h-8"
                          />
                        </PrivilegeField>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <PrivilegeField code="LINE_ITEM_HSN">
                      <Input
                        value={line.hsnSac ?? ''}
                        onChange={(e) => updateLine(index, { hsnSac: e.target.value })}
                        disabled={readOnly}
                        className="h-8"
                      />
                    </PrivilegeField>
                  </TableCell>
                  <TableCell>
                    <PrivilegeField code="LINE_ITEM_QTY">
                      <Input
                        type="number"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                        disabled={readOnly}
                        className="h-8"
                      />
                    </PrivilegeField>
                  </TableCell>
                  <TableCell>
                    <PrivilegeField code="LINE_ITEM_UNIT">
                      <Input
                        value={line.unit}
                        onChange={(e) => updateLine(index, { unit: e.target.value })}
                        disabled={readOnly}
                        className="h-8"
                      />
                    </PrivilegeField>
                  </TableCell>
                  <TableCell>
                    <PrivilegeField code="LINE_ITEM_RATE">
                      <Input
                        type="number"
                        step="0.01"
                        value={line.rate}
                        onChange={(e) => updateLine(index, { rate: Number(e.target.value) })}
                        disabled={readOnly}
                        className="h-8"
                      />
                    </PrivilegeField>
                  </TableCell>
                  <TableCell>
                    <PrivilegeField code="LINE_ITEM_DISCOUNT_PCT">
                      <Input
                        type="number"
                        value={line.discountPct}
                        onChange={(e) => updateLine(index, { discountPct: Number(e.target.value) })}
                        disabled={readOnly}
                        className="h-8"
                      />
                    </PrivilegeField>
                  </TableCell>
                  <TableCell>
                    <PrivilegeField code="LINE_ITEM_TAX_PCT">
                      <Select
                        value={String(line.taxPct)}
                        onValueChange={(v) => updateLine(index, { taxPct: Number(v) as LineItemRow['taxPct'] })}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TAX_RATES.map((r) => (
                            <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </PrivilegeField>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <PrivilegeField code="LINE_ITEM_AMOUNT">
                      {formatCurrencyINR(calc.lineTotal)}
                    </PrivilegeField>
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!readOnly && (
        <PrivilegeButton code="BTN_INVOICE_ADD_LINE" type="button" variant="outline" onClick={addLine}>
          Add Line Item
        </PrivilegeButton>
      )}
    </div>
  );
}
