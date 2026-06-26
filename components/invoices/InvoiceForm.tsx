'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoiceSchema } from '@/lib/validation/schemas';
import type { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { calcInvoice } from '@/lib/calc';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeSection } from '@/components/privilege/PrivilegeSection';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { LineItemTable, type LineItemRow } from './LineItemTable';
import { TotalsPanel } from './TotalsPanel';

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  defaultValues?: Partial<InvoiceFormValues>;
  onSubmit: (data: InvoiceFormValues) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  companyState?: string;
}

const PAYMENT_TERMS = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

/**
 * Invoice create/edit form with line items and live GST totals.
 */
export function InvoiceForm({
  defaultValues,
  onSubmit,
  onCancel,
  loading,
  companyState = 'Maharashtra',
}: InvoiceFormProps) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      paymentTerms: 'Net 30',
      shippingCharges: 0,
      roundOff: 0,
      status: 'DRAFT',
      lineItems: [{ itemName: '', quantity: 1, unit: 'Nos', rate: 0, discountPct: 0, taxPct: 18 }],
      ...defaultValues,
      invoiceDate: defaultValues?.invoiceDate
        ? new Date(defaultValues.invoiceDate)
        : new Date(),
      dueDate: defaultValues?.dueDate
        ? new Date(defaultValues.dueDate)
        : new Date(Date.now() + 30 * 86400000),
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string; billingAddress: string; shippingAddress?: string; state: string }> }>('/api/customers?pageSize=100'),
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'select'],
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string; unit: string; sellingPrice: number; taxRate: number; hsnSac?: string | null }> }>('/api/products?pageSize=100'),
  });

  const lineItems = form.watch('lineItems') as LineItemRow[];
  const shipping = form.watch('shippingCharges') ?? 0;
  const roundOff = form.watch('roundOff') ?? 0;
  const customerId = form.watch('customerId');

  const selectedCustomer = customers?.data?.find((c) => c.id === customerId);

  useEffect(() => {
    if (selectedCustomer) {
      form.setValue('billingAddress', selectedCustomer.billingAddress);
      if (selectedCustomer.shippingAddress) {
        form.setValue('shippingAddress', selectedCustomer.shippingAddress);
      }
    }
  }, [selectedCustomer, form]);

  const totals = useMemo(
    () =>
      calcInvoice(
        lineItems.map((l) => ({
          qty: l.quantity,
          rate: l.rate,
          discountPct: l.discountPct,
          taxPct: l.taxPct,
        })),
        {
          customerState: selectedCustomer?.state ?? companyState,
          companyState,
          shipping,
          roundOff,
        },
      ),
    [lineItems, selectedCustomer, companyState, shipping, roundOff],
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <PrivilegeSection code="INVOICE_HEADER" title="Invoice Details">
        <PrivilegeField code="INVOICE_NUMBER" label="Invoice Number">
          <Input {...form.register('invoiceNumber')} placeholder="Auto-generated if blank" />
        </PrivilegeField>
        <PrivilegeField code="INVOICE_DATE" label="Invoice Date" defaultRequired>
          <Input
            type="date"
            {...form.register('invoiceDate', { valueAsDate: true })}
            defaultValue={form.watch('invoiceDate')?.toISOString?.().slice(0, 10)}
          />
        </PrivilegeField>
        <PrivilegeField code="INVOICE_DUE_DATE" label="Due Date" defaultRequired>
          <Input
            type="date"
            {...form.register('dueDate', { valueAsDate: true })}
            defaultValue={form.watch('dueDate')?.toISOString?.().slice(0, 10)}
          />
        </PrivilegeField>
        <PrivilegeField code="INVOICE_REFERENCE" label="Reference / PO">
          <Input {...form.register('referenceNo')} />
        </PrivilegeField>
        <PrivilegeField code="INVOICE_PAYMENT_TERMS" label="Payment Terms" defaultRequired>
          <Select value={form.watch('paymentTerms')} onValueChange={(v) => form.setValue('paymentTerms', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>
      </PrivilegeSection>

      <PrivilegeSection code="INVOICE_CUSTOMER" title="Customer">
        <PrivilegeField code="INVOICE_CUSTOMER_ID" label="Customer" defaultRequired>
          <Select value={form.watch('customerId') ?? ''} onValueChange={(v) => form.setValue('customerId', v)}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {customers?.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>
        <div className="md:col-span-2">
          <PrivilegeField code="INVOICE_BILLING_ADDRESS" label="Billing Address">
            <Textarea {...form.register('billingAddress')} />
          </PrivilegeField>
        </div>
        <div className="md:col-span-2">
          <PrivilegeField code="INVOICE_SHIPPING_ADDRESS" label="Shipping Address">
            <Textarea {...form.register('shippingAddress')} />
          </PrivilegeField>
        </div>
      </PrivilegeSection>

      <PrivilegeSection code="INVOICE_LINE_ITEMS" title="Line Items">
        <div className="md:col-span-2">
          <LineItemTable
            lines={lineItems}
            products={products?.data?.map((p) => ({ ...p, sellingPrice: Number(p.sellingPrice) }))}
            onChange={(lines) => form.setValue('lineItems', lines)}
          />
        </div>
      </PrivilegeSection>

      <TotalsPanel
        totals={totals}
        shipping={shipping}
        roundOff={roundOff}
        onShippingChange={(v) => form.setValue('shippingCharges', v)}
        onRoundOffChange={(v) => form.setValue('roundOff', v)}
      />

      <PrivilegeSection code="INVOICE_FOOTER" title="Footer">
        <div className="md:col-span-2">
          <PrivilegeField code="INVOICE_NOTES" label="Notes">
            <Textarea {...form.register('notes')} />
          </PrivilegeField>
        </div>
        <div className="md:col-span-2">
          <PrivilegeField code="INVOICE_TERMS" label="Terms & Conditions">
            <Textarea {...form.register('terms')} />
          </PrivilegeField>
        </div>
        <PrivilegeField code="INVOICE_STATUS" label="Status">
          <Select
            value={form.watch('status') ?? 'DRAFT'}
            onValueChange={(v) => form.setValue('status', v as InvoiceFormValues['status'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'].map((s) => (
                <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>
      </PrivilegeSection>

      <div className="flex flex-wrap gap-2">
        <PrivilegeButton code="BTN_INVOICE_SAVE_DRAFT" type="submit" variant="outline" disabled={loading}>
          {loading ? 'Saving…' : 'Save as Draft'}
        </PrivilegeButton>
        <PrivilegeButton code="BTN_INVOICE_SAVE_PREVIEW" type="submit" disabled={loading}>
          Save Invoice
        </PrivilegeButton>
        {onCancel && (
          <PrivilegeButton code="BTN_INVOICE_CANCEL" type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </PrivilegeButton>
        )}
      </div>
    </form>
  );
}
