'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema } from '@/lib/validation/schemas';
import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeSection } from '@/components/privilege/PrivilegeSection';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (data: ProductFormValues) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

const TAX_RATES = [0, 5, 12, 18, 28] as const;

/**
 * Product/service create/edit form with privilege-wrapped fields.
 */
export function ProductForm({ defaultValues, onSubmit, onCancel, loading }: ProductFormProps) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      type: 'PRODUCT',
      unit: 'Nos',
      taxRate: 18,
      isActive: true,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <PrivilegeSection code="PRODUCT_BASIC" title="Basic Information">
        <PrivilegeField code="PRODUCT_NAME" label="Name" defaultRequired>
          <Input {...form.register('name')} />
        </PrivilegeField>
        <PrivilegeField code="PRODUCT_TYPE" label="Type" defaultRequired>
          <Select
            value={form.watch('type')}
            onValueChange={(v) => form.setValue('type', v as 'PRODUCT' | 'SERVICE')}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCT">Product</SelectItem>
              <SelectItem value="SERVICE">Service</SelectItem>
            </SelectContent>
          </Select>
        </PrivilegeField>
        <PrivilegeField code="PRODUCT_SKU" label="SKU">
          <Input {...form.register('sku')} />
        </PrivilegeField>
        <PrivilegeField code="PRODUCT_CATEGORY" label="Category">
          <Input {...form.register('category')} />
        </PrivilegeField>
        <div className="md:col-span-2">
          <PrivilegeField code="PRODUCT_DESCRIPTION" label="Description">
            <Textarea {...form.register('description')} />
          </PrivilegeField>
        </div>
      </PrivilegeSection>

      <PrivilegeSection code="PRODUCT_PRICING" title="Pricing & Tax">
        <PrivilegeField code="PRODUCT_HSN_SAC" label="HSN/SAC">
          <Input {...form.register('hsnSac')} />
        </PrivilegeField>
        <PrivilegeField code="PRODUCT_UNIT" label="Unit" defaultRequired>
          <Input {...form.register('unit')} />
        </PrivilegeField>
        <PrivilegeField code="PRODUCT_SELLING_PRICE" label="Selling Price (₹)" defaultRequired>
          <Input
            type="number"
            step="0.01"
            {...form.register('sellingPrice', { valueAsNumber: true })}
          />
        </PrivilegeField>
        <PrivilegeField code="PRODUCT_TAX_RATE" label="GST Rate (%)" defaultRequired>
          <Select
            value={String(form.watch('taxRate'))}
            onValueChange={(v) => form.setValue('taxRate', Number(v) as typeof TAX_RATES[number])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TAX_RATES.map((r) => (
                <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="productActive"
            checked={form.watch('isActive') ?? true}
            onCheckedChange={(c) => form.setValue('isActive', Boolean(c))}
          />
          <Label htmlFor="productActive">Active</Label>
        </div>
      </PrivilegeSection>

      <div className="flex gap-2">
        <PrivilegeButton code="BTN_PRODUCT_SAVE" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save Product'}
        </PrivilegeButton>
        {onCancel && (
          <PrivilegeButton code="BTN_PRODUCT_CANCEL" type="button" variant="outline" onClick={onCancel}>
            Cancel
          </PrivilegeButton>
        )}
      </div>
    </form>
  );
}
