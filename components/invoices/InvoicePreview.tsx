'use client';

import { formatCurrencyINR, formatDateIN } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface InvoicePreviewProps {
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    referenceNo?: string | null;
    paymentTerms: string;
    status: string;
    billingAddress: string;
    shippingAddress?: string | null;
    subtotal: number;
    totalDiscount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    shippingCharges: number;
    roundOff: number;
    grandTotal: number;
    amountInWords: string;
    notes?: string | null;
    terms?: string | null;
    customer?: { name: string; email?: string; gstin?: string | null };
    lineItems: Array<{
      itemName: string;
      description?: string | null;
      hsnSac?: string | null;
      quantity: number;
      unit: string;
      rate: number;
      discountPct: number;
      taxPct: number;
      lineTotal: number;
    }>;
  };
  company?: {
    name: string;
    email: string;
    phone: string;
    gstin?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    pincode: string;
  };
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'destructive',
};

/**
 * Printable invoice preview layout with Indian GST formatting.
 */
export function InvoicePreview({ invoice, company }: InvoicePreviewProps) {
  return (
    <Card className="mx-auto max-w-4xl print:border-0 print:shadow-none">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-2xl">{company?.name ?? 'Company Name'}</CardTitle>
          {company && (
            <div className="mt-2 text-sm text-muted-foreground">
              <p>{company.addressLine1}</p>
              {company.addressLine2 && <p>{company.addressLine2}</p>}
              <p>{company.city}, {company.state} — {company.pincode}</p>
              <p>GSTIN: {company.gstin ?? '—'}</p>
              <p>{company.email} · {company.phone}</p>
            </div>
          )}
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold">TAX INVOICE</h2>
          <Badge variant={STATUS_VARIANT[invoice.status] ?? 'default'} className="mt-2">
            {invoice.status.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Bill To</h3>
            <p className="font-medium">{invoice.customer?.name}</p>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{invoice.billingAddress}</p>
            {invoice.customer?.gstin && (
              <p className="mt-1 text-sm">GSTIN: {invoice.customer.gstin}</p>
            )}
          </div>
          <div className="text-sm sm:text-right">
            <p><span className="text-muted-foreground">Invoice #:</span> {invoice.invoiceNumber}</p>
            <p><span className="text-muted-foreground">Date:</span> {formatDateIN(invoice.invoiceDate)}</p>
            <p><span className="text-muted-foreground">Due:</span> {formatDateIN(invoice.dueDate)}</p>
            {invoice.referenceNo && (
              <p><span className="text-muted-foreground">Ref:</span> {invoice.referenceNo}</p>
            )}
            <p><span className="text-muted-foreground">Terms:</span> {invoice.paymentTerms}</p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>HSN/SAC</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Disc%</TableHead>
              <TableHead className="text-right">GST%</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lineItems.map((line, i) => (
              <TableRow key={i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <div>{line.itemName}</div>
                  {line.description && (
                    <div className="text-xs text-muted-foreground">{line.description}</div>
                  )}
                </TableCell>
                <TableCell>{line.hsnSac ?? '—'}</TableCell>
                <TableCell className="text-right">{line.quantity} {line.unit}</TableCell>
                <TableCell className="text-right">{formatCurrencyINR(Number(line.rate))}</TableCell>
                <TableCell className="text-right">{line.discountPct}%</TableCell>
                <TableCell className="text-right">{line.taxPct}%</TableCell>
                <TableCell className="text-right">{formatCurrencyINR(Number(line.lineTotal))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end">
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatCurrencyINR(Number(invoice.subtotal))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>{formatCurrencyINR(Number(invoice.totalDiscount))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Taxable</dt>
              <dd>{formatCurrencyINR(Number(invoice.taxableAmount))}</dd>
            </div>
            {Number(invoice.cgst) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">CGST</dt>
                <dd>{formatCurrencyINR(Number(invoice.cgst))}</dd>
              </div>
            )}
            {Number(invoice.sgst) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">SGST</dt>
                <dd>{formatCurrencyINR(Number(invoice.sgst))}</dd>
              </div>
            )}
            {Number(invoice.igst) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IGST</dt>
                <dd>{formatCurrencyINR(Number(invoice.igst))}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>{formatCurrencyINR(Number(invoice.shippingCharges))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Round Off</dt>
              <dd>{formatCurrencyINR(Number(invoice.roundOff))}</dd>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <dt>Grand Total</dt>
              <dd>{formatCurrencyINR(Number(invoice.grandTotal))}</dd>
            </div>
          </dl>
        </div>

        <p className="text-sm italic text-muted-foreground">{invoice.amountInWords}</p>

        {(invoice.notes || invoice.terms) && (
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            {invoice.notes && (
              <div>
                <h4 className="font-semibold">Notes</h4>
                <p className="whitespace-pre-line text-muted-foreground">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <h4 className="font-semibold">Terms & Conditions</h4>
                <p className="whitespace-pre-line text-muted-foreground">{invoice.terms}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
