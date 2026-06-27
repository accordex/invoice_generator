'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { createUserSchema, updateUserSchema } from '@/lib/validation/user';
import type { z } from 'zod';
import { apiFetch } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrivilegeField } from '@/components/privilege/PrivilegeField';
import { PrivilegeSection } from '@/components/privilege/PrivilegeSection';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type CreateValues = z.infer<typeof createUserSchema>;
type UpdateValues = z.infer<typeof updateUserSchema>;

interface RoleOption {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

interface OrgUnits {
  teams: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}

interface UserFormPropsBase {
  onCancel?: () => void;
  loading?: boolean;
}

interface CreateUserFormProps extends UserFormPropsBase {
  mode: 'create';
  defaultValues?: Partial<CreateValues>;
  onSubmit: (data: CreateValues) => Promise<void>;
}

interface EditUserFormProps extends UserFormPropsBase {
  mode: 'edit';
  defaultValues?: Partial<UpdateValues>;
  onSubmit: (data: UpdateValues) => Promise<void>;
}

type UserFormProps = CreateUserFormProps | EditUserFormProps;

const NONE = '__none__';

/**
 * User create/edit form with role and organisation assignment.
 */
export function UserForm(props: UserFormProps) {
  const { mode, defaultValues, onSubmit, onCancel, loading } = props;
  const schema = mode === 'create' ? createUserSchema : updateUserSchema;

  const form = useForm<CreateValues | UpdateValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      isActive: true,
      teamId: null,
      branchId: null,
      departmentId: null,
      ...defaultValues,
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['privilege', 'user-roles'],
    queryFn: () => apiFetch<RoleOption[]>('/api/privilege/users/roles'),
  });

  const { data: org } = useQuery({
    queryKey: ['privilege', 'org'],
    queryFn: () => apiFetch<OrgUnits>('/api/privilege/org'),
  });

  const setOptionalId = (field: 'teamId' | 'branchId' | 'departmentId', value: string) => {
    form.setValue(field, value === NONE ? null : value);
  };

  return (
    <form onSubmit={form.handleSubmit((data) => onSubmit(data as never))} className="space-y-6">
      <PrivilegeSection code="USER_BASIC" title="Account">
        <PrivilegeField code="USER_FULL_NAME" label="Full name" defaultRequired>
          <Input {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </PrivilegeField>

        <PrivilegeField code="USER_EMAIL" label="Email" defaultRequired>
          <Input type="email" autoComplete="off" {...form.register('email')} />
          {form.formState.errors.email && (
            <p className="mt-1 text-sm text-destructive">{form.formState.errors.email.message}</p>
          )}
        </PrivilegeField>

        <PrivilegeField
          code="USER_PASSWORD"
          label={mode === 'create' ? 'Password' : 'New password (leave blank to keep current)'}
          defaultRequired={mode === 'create'}
        >
          <Input
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'off'}
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-sm text-destructive">{form.formState.errors.password.message}</p>
          )}
        </PrivilegeField>

        <div className="flex items-center gap-2">
          <Checkbox
            id="isActive"
            checked={form.watch('isActive')}
            onCheckedChange={(checked) => form.setValue('isActive', checked === true)}
          />
          <Label htmlFor="isActive">Active account</Label>
        </div>
      </PrivilegeSection>

      <PrivilegeSection code="USER_ORG" title="Role & organisation">
        <PrivilegeField code="USER_TEAM" label="Role" defaultRequired>
          <Select
            value={form.watch('roleId') ?? ''}
            onValueChange={(v) => form.setValue('roleId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.roleId && (
            <p className="mt-1 text-sm text-destructive">{form.formState.errors.roleId.message}</p>
          )}
        </PrivilegeField>

        <PrivilegeField code="USER_TEAM" label="Team">
          <Select
            value={form.watch('teamId') ?? NONE}
            onValueChange={(v) => setOptionalId('teamId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {org?.teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>

        <PrivilegeField code="USER_BRANCH" label="Branch">
          <Select
            value={form.watch('branchId') ?? NONE}
            onValueChange={(v) => setOptionalId('branchId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {org?.branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>

        <PrivilegeField code="USER_DEPARTMENT" label="Department">
          <Select
            value={form.watch('departmentId') ?? NONE}
            onValueChange={(v) => setOptionalId('departmentId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {org?.departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PrivilegeField>
      </PrivilegeSection>

      <div className="flex gap-2">
        <PrivilegeButton code="BTN_USER_SAVE" type="submit" disabled={loading}>
          {loading ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
        </PrivilegeButton>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
