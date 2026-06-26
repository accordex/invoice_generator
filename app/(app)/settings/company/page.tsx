'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companySchema } from '@/lib/validation/schemas';
import type { z } from 'zod';
import { apiFetch } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeSection } from '@/components/privilege/PrivilegeSection';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type CompanyForm = z.infer<typeof companySchema>;

const INDIAN_STATES = [
  'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Delhi', 'Gujarat', 'Rajasthan',
  'Uttar Pradesh', 'West Bengal', 'Telangana', 'Kerala',
];

export default function CompanySettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: company, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => apiFetch<CompanyForm>('/api/company'),
  });

  const form = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    values: company,
  });

  const mutation = useMutation({
    mutationFn: (data: CompanyForm) =>
      apiFetch('/api/company', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast({ title: 'Company profile saved' });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Save failed', description: err.message });
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Guarded action="COMPANY.VIEW">
      <PageHeader title="Company Profile" description="Your business identity for invoices" />
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="max-w-3xl space-y-6">
        <PrivilegeSection code="COMPANY_IDENTITY" title="Identity">
          <PrivilegeField code="COMPANY_NAME" label="Company Name" defaultRequired>
            <Input {...form.register('name')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_EMAIL" label="Email" defaultRequired>
            <Input type="email" {...form.register('email')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_PHONE" label="Phone" defaultRequired>
            <Input {...form.register('phone')} />
          </PrivilegeField>
        </PrivilegeSection>

        <PrivilegeSection code="COMPANY_TAX" title="Tax Information">
          <PrivilegeField code="COMPANY_GSTIN" label="GSTIN">
            <Input {...form.register('gstin')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_PAN" label="PAN">
            <Input {...form.register('pan')} />
          </PrivilegeField>
        </PrivilegeSection>

        <PrivilegeSection code="COMPANY_ADDRESS" title="Address">
          <PrivilegeField code="COMPANY_ADDRESS1" label="Address Line 1" defaultRequired>
            <Input {...form.register('addressLine1')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_ADDRESS2" label="Address Line 2">
            <Input {...form.register('addressLine2')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_CITY" label="City" defaultRequired>
            <Input {...form.register('city')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_STATE" label="State" defaultRequired>
            <Input {...form.register('state')} list="states" />
            <datalist id="states">
              {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
            </datalist>
          </PrivilegeField>
          <PrivilegeField code="COMPANY_PINCODE" label="Pincode" defaultRequired>
            <Input {...form.register('pincode')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_COUNTRY" label="Country" defaultRequired>
            <Input {...form.register('country')} />
          </PrivilegeField>
        </PrivilegeSection>

        <PrivilegeSection code="COMPANY_FINANCIAL" title="Financial">
          <PrivilegeField code="COMPANY_CURRENCY" label="Currency" defaultRequired>
            <Input {...form.register('defaultCurrency')} readOnly />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_BANK_NAME" label="Bank Name">
            <Input {...form.register('bankName')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_ACCOUNT_NO" label="Account Number">
            <Input {...form.register('accountNumber')} />
          </PrivilegeField>
          <PrivilegeField code="COMPANY_IFSC" label="IFSC">
            <Input {...form.register('ifsc')} />
          </PrivilegeField>
        </PrivilegeSection>

        <PrivilegeButton code="BTN_COMPANY_SAVE" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save Profile'}
        </PrivilegeButton>
      </form>
    </Guarded>
  );
}
