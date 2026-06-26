'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema } from '@/lib/validation/schemas';
import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeSection } from '@/components/privilege/PrivilegeSection';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type CustomerFormValues = z.infer<typeof customerSchema>;

interface CustomerFormProps {
  defaultValues?: Partial<CustomerFormValues>;
  onSubmit: (data: CustomerFormValues) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi',
];

/**
 * Customer create/edit form with privilege-wrapped fields.
 */
export function CustomerForm({ defaultValues, onSubmit, onCancel, loading }: CustomerFormProps) {
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      type: 'BUSINESS',
      isActive: true,
      country: 'India',
      ...defaultValues,
    } as CustomerFormValues,
  });

  const customerType = form.watch('type');

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <PrivilegeSection code="CUSTOMER_BASIC" title="Basic Information">
        <PrivilegeField code="CUSTOMER_NAME" label="Name" defaultRequired>
          <Input {...form.register('name')} />
        </PrivilegeField>
        <PrivilegeField code="CUSTOMER_TYPE" label="Type" defaultRequired>
          <Select
            value={form.watch('type')}
            onValueChange={(v) => form.setValue('type', v as 'INDIVIDUAL' | 'BUSINESS')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INDIVIDUAL">Individual</SelectItem>
              <SelectItem value="BUSINESS">Business</SelectItem>
            </SelectContent>
          </Select>
        </PrivilegeField>
      </PrivilegeSection>

      <PrivilegeSection code="CUSTOMER_CONTACT" title="Contact">
        <PrivilegeField code="CUSTOMER_EMAIL" label="Email" defaultRequired>
          <Input type="email" {...form.register('email')} />
        </PrivilegeField>
        <PrivilegeField code="CUSTOMER_PHONE" label="Phone" defaultRequired>
          <Input {...form.register('phone')} />
        </PrivilegeField>
      </PrivilegeSection>

      {customerType === 'BUSINESS' && (
        <PrivilegeSection code="CUSTOMER_TAX" title="Tax">
          <PrivilegeField code="CUSTOMER_GSTIN" label="GSTIN">
            <Input {...form.register('gstin')} placeholder="22AAAAA0000A1Z5" />
          </PrivilegeField>
        </PrivilegeSection>
      )}

      <PrivilegeSection code="CUSTOMER_ADDRESS" title="Address">
        <div className="md:col-span-2">
          <PrivilegeField code="CUSTOMER_BILLING_ADDRESS" label="Billing Address" defaultRequired>
            <Textarea {...form.register('billingAddress')} />
          </PrivilegeField>
        </div>
        <div className="md:col-span-2">
          <PrivilegeField code="CUSTOMER_SHIPPING_ADDRESS" label="Shipping Address">
            <Textarea {...form.register('shippingAddress')} />
          </PrivilegeField>
        </div>
        <PrivilegeField code="CUSTOMER_CITY" label="City" defaultRequired>
          <Input {...form.register('city')} />
        </PrivilegeField>
        <PrivilegeField code="CUSTOMER_STATE" label="State" defaultRequired>
          <Select value={form.watch('state')} onValueChange={(v) => form.setValue('state', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>
        <PrivilegeField code="CUSTOMER_PINCODE" label="Pincode" defaultRequired>
          <Input {...form.register('pincode')} />
        </PrivilegeField>
      </PrivilegeSection>

      <PrivilegeSection code="CUSTOMER_META" title="Notes">
        <div className="md:col-span-2">
          <PrivilegeField code="CUSTOMER_NOTES" label="Notes">
            <Textarea {...form.register('notes')} />
          </PrivilegeField>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="isActive"
            checked={form.watch('isActive') ?? true}
            onCheckedChange={(c) => form.setValue('isActive', Boolean(c))}
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      </PrivilegeSection>

      <div className="flex gap-2">
        <PrivilegeButton code="BTN_CUSTOMER_SAVE" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save Customer'}
        </PrivilegeButton>
        {onCancel && (
          <PrivilegeButton code="BTN_CUSTOMER_CANCEL" type="button" variant="outline" onClick={onCancel}>
            Cancel
          </PrivilegeButton>
        )}
        <Button type="button" variant="ghost" onClick={() => form.reset()}>
          Reset
        </Button>
      </div>
    </form>
  );
}
