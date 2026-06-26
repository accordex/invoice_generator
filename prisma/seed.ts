import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calcInvoice, calcLine } from '@/lib/calc';
import { invoiceManifest } from '@/lib/privilege/manifest';
import { prisma } from '@/lib/prisma';
import { syncManifestToRegistry } from '@/lib/privilege/registry-sync';
import { recomputeEffectivePrivileges } from '@/lib/privilege/resolver';
import type { ProductManifest } from '@/lib/privilege/types';

const SEED_PASSWORD = 'Password@123';
const SEED_ACTOR = 'seed';

type GrantInput = {
  targetLevel: string;
  targetId: string;
  mode: string;
  maskPattern?: string;
};

/** Converts a number to Prisma.Decimal with two decimal places. */
function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

/** Converts a quantity to Prisma.Decimal with up to three decimal places. */
function qty(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(3));
}

/**
 * Upserts a single role privilege grant (idempotent).
 *
 * @param roleId - Role receiving the grant.
 * @param grant - Target level, id, mode, and optional mask pattern.
 */
async function upsertGrant(roleId: string, grant: GrantInput): Promise<void> {
  await prisma.rolePrivilegeGrant.upsert({
    where: {
      roleId_targetLevel_targetId: {
        roleId,
        targetLevel: grant.targetLevel,
        targetId: grant.targetId,
      },
    },
    create: {
      roleId,
      targetLevel: grant.targetLevel,
      targetId: grant.targetId,
      mode: grant.mode,
      maskPattern: grant.maskPattern,
      createdBy: SEED_ACTOR,
    },
    update: {
      mode: grant.mode,
      maskPattern: grant.maskPattern,
    },
  });
}

/**
 * Applies a batch of grants to a role.
 *
 * @param roleId - Role receiving the grants.
 * @param grants - Grant definitions to upsert.
 */
async function applyGrants(roleId: string, grants: GrantInput[]): Promise<void> {
  for (const grant of grants) {
    await upsertGrant(roleId, grant);
  }
}

/**
 * Builds full EDIT/ALLOW/EXPORT grants from the product manifest.
 *
 * @param manifest - Product manifest used to enumerate registry targets.
 * @param opts - Optional overrides for module mode, report mode, and record scope.
 */
function buildManifestGrants(
  manifest: ProductManifest,
  opts: {
    moduleMode?: string;
    formMode?: string;
    reportMode?: string;
    recordScope?: string;
    menuMode?: string;
    actionMode?: string;
    bulkMode?: string;
    transitionMode?: string;
    columnMode?: string;
    filterMode?: string;
    widgetMode?: string;
    columnMask?: (code: string, defaultMask?: string) => string | undefined;
  } = {},
): GrantInput[] {
  const {
    moduleMode = 'EDIT',
    formMode = 'EDIT',
    reportMode = 'EXPORT',
    recordScope = 'ALL',
    menuMode = 'VISIBLE',
    actionMode = 'ALLOW',
    bulkMode = 'ALLOW',
    transitionMode = 'ALLOW',
    columnMode = 'VISIBLE',
    filterMode = 'VISIBLE',
    widgetMode = 'VISIBLE',
    columnMask,
  } = opts;

  const grants: GrantInput[] = [];

  for (const item of manifest.menuItems) {
    grants.push({ targetLevel: 'MENU_ITEM', targetId: item.code, mode: menuMode });
  }

  for (const mod of manifest.modules) {
    grants.push({ targetLevel: 'MODULE', targetId: mod.code, mode: moduleMode });
    if (mod.scopes.length > 0) {
      grants.push({ targetLevel: 'RECORD_SCOPE', targetId: mod.code, mode: recordScope });
    }
    for (const action of mod.actions) {
      grants.push({ targetLevel: 'ACTION', targetId: action.code, mode: actionMode });
    }
    for (const bulk of mod.bulkActions) {
      grants.push({ targetLevel: 'BULK_ACTION', targetId: bulk.code, mode: bulkMode });
    }
    for (const transition of mod.transitions) {
      grants.push({ targetLevel: 'STATUS_TRANSITION', targetId: transition.code, mode: transitionMode });
    }
    for (const form of mod.forms) {
      grants.push({ targetLevel: 'FORM', targetId: form.code, mode: formMode });
      for (const button of form.buttons ?? []) {
        grants.push({ targetLevel: 'BUTTON', targetId: button.code, mode: menuMode });
      }
      for (const tab of form.tabs ?? []) {
        grants.push({ targetLevel: 'TAB', targetId: tab.code, mode: formMode });
        for (const section of tab.sections) {
          grants.push({ targetLevel: 'SECTION', targetId: section.code, mode: formMode });
          for (const field of section.fields) {
            grants.push({ targetLevel: 'FIELD', targetId: field.code, mode: formMode });
          }
        }
      }
      for (const section of form.sections ?? []) {
        grants.push({ targetLevel: 'SECTION', targetId: section.code, mode: formMode });
        for (const field of section.fields) {
          grants.push({ targetLevel: 'FIELD', targetId: field.code, mode: formMode });
        }
      }
    }
    for (const column of mod.listColumns) {
      grants.push({
        targetLevel: 'LIST_COLUMN',
        targetId: column.code,
        mode: columnMode,
        maskPattern: columnMask?.(column.code, column.defaultMaskPattern),
      });
    }
    for (const filter of mod.listFilters) {
      grants.push({ targetLevel: 'LIST_FILTER', targetId: filter.code, mode: filterMode });
    }
  }

  for (const report of manifest.reports) {
    grants.push({ targetLevel: 'REPORT', targetId: report.code, mode: reportMode });
  }
  for (const widget of manifest.dashboardWidgets) {
    grants.push({ targetLevel: 'DASHBOARD_WIDGET', targetId: widget.code, mode: widgetMode });
  }

  return grants;
}

/**
 * Seeds system roles with default grants per spec B.10.
 *
 * @param manifest - Product manifest for grant enumeration.
 * @returns Map of role code to role id.
 */
async function seedSystemRoles(manifest: ProductManifest): Promise<Map<string, string>> {
  const roleDefs = [
    { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Bypasses all privilege checks' },
    { code: 'ADMIN', name: 'Administrator', description: 'Full access including privilege management' },
    { code: 'ACCOUNTANT', name: 'Accountant', description: 'Finance operations with approval-gated reversals' },
    { code: 'SALES', name: 'Sales', description: 'Team-scoped sales access' },
    { code: 'VIEWER', name: 'Viewer', description: 'Read-only with masked PII' },
    { code: 'AUDITOR', name: 'Auditor', description: 'Read-only with audit log and export access' },
  ];

  const roleIds = new Map<string, string>();

  for (const def of roleDefs) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      update: {
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });
    roleIds.set(def.code, role.id);
  }

  // SUPER_ADMIN: grants stored for reference; runtime bypass uses isSuperAdmin flag.
  await applyGrants(roleIds.get('SUPER_ADMIN')!, buildManifestGrants(manifest));

  // ADMIN: full access including PRIVILEGE.MANAGE and user management.
  await applyGrants(roleIds.get('ADMIN')!, buildManifestGrants(manifest));

  // ACCOUNTANT: EDIT on business modules; approval-gated high-risk actions; no privilege/user mgmt.
  const accountantGrants = buildManifestGrants(manifest).filter(
    (g) => !['PRIVILEGE_MGMT', 'USER_MGMT'].includes(g.targetId) || g.targetLevel !== 'MODULE',
  );
  accountantGrants.push(
    { targetLevel: 'MODULE', targetId: 'PRIVILEGE_MGMT', mode: 'NO_ACCESS' },
    { targetLevel: 'MODULE', targetId: 'USER_MGMT', mode: 'NO_ACCESS' },
    { targetLevel: 'ACTION', targetId: 'PRIVILEGE.MANAGE', mode: 'DENY' },
    { targetLevel: 'ACTION', targetId: 'PRIVILEGE.AUDIT_VIEW', mode: 'DENY' },
    { targetLevel: 'ACTION', targetId: 'USER.LIST', mode: 'DENY' },
    { targetLevel: 'STATUS_TRANSITION', targetId: 'INVOICE.PAID_TO_CANCELLED', mode: 'ALLOW_WITH_APPROVAL' },
    { targetLevel: 'BULK_ACTION', targetId: 'INVOICE.BULK_DELETE', mode: 'DENY' },
    { targetLevel: 'ACTION', targetId: 'PAYMENT.REFUND', mode: 'ALLOW_WITH_APPROVAL' },
  );
  await applyGrants(roleIds.get('ACCOUNTANT')!, accountantGrants);

  // SALES: team-scoped EDIT on invoices/customers; VIEW on products/payments; limited reports.
  const salesGrants = buildManifestGrants(manifest, {
    moduleMode: 'VIEW',
    formMode: 'VIEW',
    reportMode: 'HIDDEN',
    recordScope: 'TEAM',
    actionMode: 'DENY',
    bulkMode: 'DENY',
    transitionMode: 'DENY',
  });
  const salesModules = ['INVOICES', 'CUSTOMERS', 'PRODUCTS', 'PAYMENTS'];
  for (const grant of salesGrants) {
    if (grant.targetLevel === 'MODULE' && salesModules.includes(grant.targetId)) {
      grant.mode = grant.targetId === 'PRODUCTS' || grant.targetId === 'PAYMENTS' ? 'VIEW' : 'EDIT';
    }
    if (grant.targetLevel === 'FORM') {
      grant.mode = 'EDIT';
    }
    if (grant.targetLevel === 'RECORD_SCOPE' && ['INVOICES', 'CUSTOMERS'].includes(grant.targetId)) {
      grant.mode = 'TEAM';
    }
    if (grant.targetLevel === 'ACTION') {
      const allowed = [
        'INVOICE.LIST',
        'INVOICE.VIEW',
        'INVOICE.CREATE',
        'INVOICE.EDIT',
        'INVOICE.DUPLICATE',
        'INVOICE.DOWNLOAD_PDF',
        'INVOICE.PRINT',
        'CUSTOMER.LIST',
        'CUSTOMER.VIEW',
        'CUSTOMER.CREATE',
        'CUSTOMER.EDIT',
        'PRODUCT.LIST',
        'PRODUCT.VIEW',
        'PAYMENT.LIST',
        'PAYMENT.VIEW',
      ];
      if (allowed.includes(grant.targetId)) grant.mode = 'ALLOW';
    }
    if (grant.targetLevel === 'STATUS_TRANSITION') {
      const allowed = ['INVOICE.DRAFT_TO_SENT', 'INVOICE.DRAFT_TO_CANCELLED', 'INVOICE.SENT_TO_PARTIALLY_PAID'];
      if (allowed.includes(grant.targetId)) grant.mode = 'ALLOW';
    }
    if (grant.targetLevel === 'REPORT' && ['RPT_TOP_CUSTOMERS', 'RPT_TOP_PRODUCTS'].includes(grant.targetId)) {
      grant.mode = 'VIEW';
    }
  }
  salesGrants.push(
    { targetLevel: 'ACTION', targetId: 'INVOICE.DELETE', mode: 'DENY' },
    { targetLevel: 'STATUS_TRANSITION', targetId: 'INVOICE.PAID_TO_CANCELLED', mode: 'DENY' },
    { targetLevel: 'BULK_ACTION', targetId: 'INVOICE.BULK_DELETE', mode: 'DENY' },
    { targetLevel: 'BULK_ACTION', targetId: 'INVOICE.BULK_SEND', mode: 'DENY' },
  );
  await applyGrants(roleIds.get('SALES')!, salesGrants);

  // VIEWER: read-only with masked PII columns.
  const viewerGrants = buildManifestGrants(manifest, {
    moduleMode: 'VIEW',
    formMode: 'VIEW',
    reportMode: 'VIEW',
    recordScope: 'ALL',
    actionMode: 'DENY',
    bulkMode: 'DENY',
    transitionMode: 'DENY',
    columnMode: 'VISIBLE',
    columnMask: (code, defaultMask) => defaultMask,
  });
  const viewerReadActions = [
    'INVOICE.LIST',
    'INVOICE.VIEW',
    'INVOICE.DOWNLOAD_PDF',
    'INVOICE.PRINT',
    'CUSTOMER.LIST',
    'CUSTOMER.VIEW',
    'PRODUCT.LIST',
    'PRODUCT.VIEW',
    'PAYMENT.LIST',
    'PAYMENT.VIEW',
    'COMPANY.VIEW',
  ];
  for (const grant of viewerGrants) {
    if (grant.targetLevel === 'ACTION' && viewerReadActions.includes(grant.targetId)) {
      grant.mode = 'ALLOW';
    }
    if (grant.targetLevel === 'LIST_COLUMN' && grant.maskPattern) {
      grant.mode = 'MASKED';
    }
    if (
      grant.targetLevel === 'LIST_COLUMN' &&
      grant.targetId === 'COL_PAYMENT_RAZORPAY_ID'
    ) {
      grant.mode = 'MASKED';
      grant.maskPattern = 'MASK_LAST_4';
    }
  }
  viewerGrants.push(
    { targetLevel: 'ACTION', targetId: 'INVOICE.DELETE', mode: 'DENY' },
    { targetLevel: 'ACTION', targetId: 'CUSTOMER.DELETE', mode: 'DENY' },
    { targetLevel: 'ACTION', targetId: 'PRODUCT.DELETE', mode: 'DENY' },
    { targetLevel: 'ACTION', targetId: 'PAYMENT.REFUND', mode: 'DENY' },
  );
  await applyGrants(roleIds.get('VIEWER')!, viewerGrants);

  // AUDITOR: read-only unmasked + audit view + report export.
  const auditorGrants = buildManifestGrants(manifest, {
    moduleMode: 'VIEW',
    formMode: 'VIEW',
    reportMode: 'EXPORT',
    recordScope: 'ALL',
    actionMode: 'DENY',
    bulkMode: 'DENY',
    transitionMode: 'DENY',
  });
  const auditorReadActions = [
    ...viewerReadActions,
    'PRIVILEGE.AUDIT_VIEW',
  ];
  for (const grant of auditorGrants) {
    if (grant.targetLevel === 'ACTION' && auditorReadActions.includes(grant.targetId)) {
      grant.mode = 'ALLOW';
    }
    if (grant.targetLevel === 'LIST_COLUMN') {
      grant.mode = 'VISIBLE';
      grant.maskPattern = undefined;
    }
  }
  await applyGrants(roleIds.get('AUDITOR')!, auditorGrants);

  return roleIds;
}

/**
 * Main database seed — registry, org, users, roles, sample business data.
 * Idempotent via upserts on unique keys.
 */
async function main(): Promise<void> {
  console.log('Syncing privilege registry from manifest…');
  const syncResult = await syncManifestToRegistry(invoiceManifest);
  console.log('Registry sync:', syncResult);

  const roleIds = await seedSystemRoles(invoiceManifest);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const branchBangalore = await prisma.branch.upsert({
    where: { id: 'seed-branch-bangalore' },
    create: { id: 'seed-branch-bangalore', name: 'Bangalore HQ' },
    update: { name: 'Bangalore HQ' },
  });
  const branchChennai = await prisma.branch.upsert({
    where: { id: 'seed-branch-chennai' },
    create: { id: 'seed-branch-chennai', name: 'Chennai Branch' },
    update: { name: 'Chennai Branch' },
  });

  const teamEnterprise = await prisma.team.upsert({
    where: { id: 'seed-team-enterprise' },
    create: { id: 'seed-team-enterprise', name: 'Enterprise Sales', branchId: branchBangalore.id },
    update: { name: 'Enterprise Sales', branchId: branchBangalore.id },
  });
  const teamSmb = await prisma.team.upsert({
    where: { id: 'seed-team-smb' },
    create: { id: 'seed-team-smb', name: 'SMB Sales', branchId: branchChennai.id },
    update: { name: 'SMB Sales', branchId: branchChennai.id },
  });

  const deptFinance = await prisma.department.upsert({
    where: { id: 'seed-dept-finance' },
    create: { id: 'seed-dept-finance', name: 'Finance' },
    update: { name: 'Finance' },
  });
  const deptSales = await prisma.department.upsert({
    where: { id: 'seed-dept-sales' },
    create: { id: 'seed-dept-sales', name: 'Sales' },
    update: { name: 'Sales' },
  });

  const userDefs = [
    {
      email: 'superadmin@accordex.com',
      name: 'Super Admin',
      roleCode: 'SUPER_ADMIN',
      isSuperAdmin: true,
      teamId: null as string | null,
      branchId: branchBangalore.id,
      departmentId: deptFinance.id,
    },
    {
      email: 'admin@accordex.com',
      name: 'System Admin',
      roleCode: 'ADMIN',
      isSuperAdmin: false,
      teamId: null,
      branchId: branchBangalore.id,
      departmentId: deptFinance.id,
    },
    {
      email: 'accountant@accordex.com',
      name: 'Priya Accountant',
      roleCode: 'ACCOUNTANT',
      isSuperAdmin: false,
      teamId: null,
      branchId: branchBangalore.id,
      departmentId: deptFinance.id,
    },
    {
      email: 'sales@accordex.com',
      name: 'Ravi Sales',
      roleCode: 'SALES',
      isSuperAdmin: false,
      teamId: teamEnterprise.id,
      branchId: branchBangalore.id,
      departmentId: deptSales.id,
    },
    {
      email: 'viewer@accordex.com',
      name: 'Vikram Viewer',
      roleCode: 'VIEWER',
      isSuperAdmin: false,
      teamId: null,
      branchId: branchChennai.id,
      departmentId: deptSales.id,
    },
    {
      email: 'auditor@accordex.com',
      name: 'Anita Auditor',
      roleCode: 'AUDITOR',
      isSuperAdmin: false,
      teamId: null,
      branchId: branchBangalore.id,
      departmentId: deptFinance.id,
    },
  ];

  const userIds = new Map<string, string>();

  for (const def of userDefs) {
    const user = await prisma.user.upsert({
      where: { email: def.email },
      create: {
        email: def.email,
        name: def.name,
        passwordHash,
        isActive: true,
        isSuperAdmin: def.isSuperAdmin,
        teamId: def.teamId,
        branchId: def.branchId,
        departmentId: def.departmentId,
      },
      update: {
        name: def.name,
        passwordHash,
        isActive: true,
        isSuperAdmin: def.isSuperAdmin,
        teamId: def.teamId,
        branchId: def.branchId,
        departmentId: def.departmentId,
      },
    });
    userIds.set(def.email, user.id);

    const roleId = roleIds.get(def.roleCode)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      create: { userId: user.id, roleId, assignedBy: SEED_ACTOR },
      update: {},
    });
  }

  const adminId = userIds.get('admin@accordex.com')!;
  const accountantId = userIds.get('accountant@accordex.com')!;
  const salesId = userIds.get('sales@accordex.com')!;

  const existingCompany = await prisma.company.findFirst();
  if (existingCompany) {
    await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        name: 'Accordex Systems Pvt Ltd',
        email: 'billing@accordex.com',
        phone: '+91-80-41234567',
        gstin: '29AABCA1234A1Z5',
        pan: 'AABCA1234A',
        addressLine1: '42, MG Road',
        addressLine2: 'Indiranagar',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560038',
        country: 'India',
        defaultCurrency: 'INR',
        bankName: 'HDFC Bank',
        accountNumber: '50100123456789',
        ifsc: 'HDFC0001234',
      },
    });
  } else {
    await prisma.company.create({
      data: {
        name: 'Accordex Systems Pvt Ltd',
        email: 'billing@accordex.com',
        phone: '+91-80-41234567',
        gstin: '29AABCA1234A1Z5',
        pan: 'AABCA1234A',
        addressLine1: '42, MG Road',
        addressLine2: 'Indiranagar',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560038',
        country: 'India',
        defaultCurrency: 'INR',
        bankName: 'HDFC Bank',
        accountNumber: '50100123456789',
        ifsc: 'HDFC0001234',
      },
    });
  }

  const customerIndividual = await prisma.customer.upsert({
    where: { id: 'seed-customer-individual' },
    create: {
      id: 'seed-customer-individual',
      name: 'Arjun Mehta',
      type: 'INDIVIDUAL',
      email: 'arjun.mehta@example.com',
      phone: '+91-9876543210',
      billingAddress: '15, 4th Cross, Koramangala',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560034',
      createdById: salesId,
      teamId: teamEnterprise.id,
      branchId: branchBangalore.id,
      departmentId: deptSales.id,
    },
    update: {
      name: 'Arjun Mehta',
      type: 'INDIVIDUAL',
      email: 'arjun.mehta@example.com',
      phone: '+91-9876543210',
      billingAddress: '15, 4th Cross, Koramangala',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560034',
      createdById: salesId,
      teamId: teamEnterprise.id,
    },
  });

  const customerKarnataka = await prisma.customer.upsert({
    where: { id: 'seed-customer-karnataka-biz' },
    create: {
      id: 'seed-customer-karnataka-biz',
      name: 'Karnataka Tech Solutions Pvt Ltd',
      type: 'BUSINESS',
      email: 'accounts@karnatakbiz.in',
      phone: '+91-80-99887766',
      gstin: '29AABCK5678B1Z3',
      billingAddress: '100, Electronic City Phase 1',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560100',
      createdById: salesId,
      teamId: teamEnterprise.id,
      branchId: branchBangalore.id,
      departmentId: deptSales.id,
    },
    update: {
      name: 'Karnataka Tech Solutions Pvt Ltd',
      gstin: '29AABCK5678B1Z3',
      state: 'Karnataka',
      createdById: salesId,
      teamId: teamEnterprise.id,
    },
  });

  const customerTamilNadu = await prisma.customer.upsert({
    where: { id: 'seed-customer-tamilnadu-biz' },
    create: {
      id: 'seed-customer-tamilnadu-biz',
      name: 'Chennai Manufacturing Co',
      type: 'BUSINESS',
      email: 'finance@chennaimfg.in',
      phone: '+91-44-44556677',
      gstin: '33AABCC9012C1Z8',
      billingAddress: '22, Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
      createdById: adminId,
      teamId: teamSmb.id,
      branchId: branchChennai.id,
      departmentId: deptSales.id,
    },
    update: {
      name: 'Chennai Manufacturing Co',
      gstin: '33AABCC9012C1Z8',
      state: 'Tamil Nadu',
      createdById: adminId,
      teamId: teamSmb.id,
    },
  });

  const productDefs = [
    { id: 'seed-product-exempt', name: 'Consultation (Exempt)', type: 'SERVICE', sku: 'SVC-EXEMPT', taxRate: 0, price: 2500, hsnSac: '998314' },
    { id: 'seed-product-5', name: 'Notebook Pack', type: 'PRODUCT', sku: 'PRD-5PCT', taxRate: 5, price: 150, hsnSac: '482010' },
    { id: 'seed-product-12', name: 'Office Chair', type: 'PRODUCT', sku: 'PRD-12PCT', taxRate: 12, price: 8500, hsnSac: '940130' },
    { id: 'seed-product-18', name: 'Software License', type: 'SERVICE', sku: 'SVC-18PCT', taxRate: 18, price: 12000, hsnSac: '998314' },
    { id: 'seed-product-28', name: 'Luxury Pen Set', type: 'PRODUCT', sku: 'PRD-28PCT', taxRate: 28, price: 4500, hsnSac: '960810' },
  ];

  const products = new Map<string, { id: string; name: string; taxRate: number; price: number; unit: string; hsnSac: string }>();

  for (const p of productDefs) {
    const row = await prisma.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        type: p.type,
        sku: p.sku,
        hsnSac: p.hsnSac,
        unit: p.type === 'SERVICE' ? 'Hours' : 'Nos',
        sellingPrice: dec(p.price),
        taxRate: p.taxRate,
        category: p.type === 'SERVICE' ? 'Services' : 'Goods',
        createdById: adminId,
      },
      update: {
        name: p.name,
        sellingPrice: dec(p.price),
        taxRate: p.taxRate,
      },
    });
    products.set(p.id, {
      id: row.id,
      name: row.name,
      taxRate: p.taxRate,
      price: p.price,
      unit: p.type === 'SERVICE' ? 'Hours' : 'Nos',
      hsnSac: p.hsnSac,
    });
  }

  const companyState = 'Karnataka';

  type InvoiceSeed = {
    id: string;
    number: string;
    status: string;
    customerId: string;
    customerState: string;
    lines: { productId: string; qty: number; discountPct?: number }[];
    shipping?: number;
    roundOff?: number;
    createdById: string;
    teamId?: string | null;
  };

  const invoiceSeeds: InvoiceSeed[] = [
    {
      id: 'seed-invoice-draft',
      number: 'INV-2025-0001',
      status: 'DRAFT',
      customerId: customerIndividual.id,
      customerState: 'Karnataka',
      lines: [{ productId: 'seed-product-12', qty: 2 }],
      createdById: salesId,
      teamId: teamEnterprise.id,
    },
    {
      id: 'seed-invoice-sent-intra',
      number: 'INV-2025-0002',
      status: 'SENT',
      customerId: customerKarnataka.id,
      customerState: 'Karnataka',
      lines: [
        { productId: 'seed-product-18', qty: 1 },
        { productId: 'seed-product-5', qty: 10, discountPct: 5 },
      ],
      shipping: 200,
      createdById: salesId,
      teamId: teamEnterprise.id,
    },
    {
      id: 'seed-invoice-sent-inter',
      number: 'INV-2025-0003',
      status: 'SENT',
      customerId: customerTamilNadu.id,
      customerState: 'Tamil Nadu',
      lines: [{ productId: 'seed-product-28', qty: 3, discountPct: 10 }],
      createdById: adminId,
      teamId: teamSmb.id,
    },
    {
      id: 'seed-invoice-paid',
      number: 'INV-2025-0004',
      status: 'PAID',
      customerId: customerKarnataka.id,
      customerState: 'Karnataka',
      lines: [{ productId: 'seed-product-exempt', qty: 4 }],
      createdById: accountantId,
      teamId: teamEnterprise.id,
    },
    {
      id: 'seed-invoice-cancelled',
      number: 'INV-2025-0005',
      status: 'CANCELLED',
      customerId: customerIndividual.id,
      customerState: 'Karnataka',
      lines: [{ productId: 'seed-product-5', qty: 5 }],
      createdById: salesId,
      teamId: teamEnterprise.id,
    },
  ];

  const invoiceIds = new Map<string, string>();

  for (const inv of invoiceSeeds) {
    const customer = [customerIndividual, customerKarnataka, customerTamilNadu].find((c) => c.id === inv.customerId)!;
    const lineInputs = inv.lines.map((line) => {
      const product = products.get(line.productId)!;
      return {
        qty: line.qty,
        rate: product.price,
        discountPct: line.discountPct ?? 0,
        taxPct: product.taxRate,
      };
    });
    const totals = calcInvoice(lineInputs, {
      customerState: inv.customerState,
      companyState,
      shipping: inv.shipping ?? 0,
      roundOff: inv.roundOff ?? 0,
    });
    const lineResults = lineInputs.map(calcLine);

    const invoice = await prisma.invoice.upsert({
      where: { invoiceNumber: inv.number },
      create: {
        id: inv.id,
        invoiceNumber: inv.number,
        invoiceDate: new Date('2025-06-01'),
        dueDate: new Date('2025-06-30'),
        paymentTerms: 'Net 30',
        customerId: inv.customerId,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress,
        subtotal: dec(totals.subtotal),
        totalDiscount: dec(totals.totalDiscount),
        taxableAmount: dec(totals.taxableAmount),
        cgst: dec(totals.cgst),
        sgst: dec(totals.sgst),
        igst: dec(totals.igst),
        shippingCharges: dec(totals.shippingCharges),
        roundOff: dec(totals.roundOff),
        grandTotal: dec(totals.grandTotal),
        amountInWords: totals.amountInWords,
        notes: 'Thank you for your business.',
        terms: 'Payment due within 30 days.',
        status: inv.status,
        createdById: inv.createdById,
        teamId: inv.teamId,
        branchId: inv.teamId === teamEnterprise.id ? branchBangalore.id : branchChennai.id,
        departmentId: deptSales.id,
        lineItems: {
          create: inv.lines.map((line, idx) => {
            const product = products.get(line.productId)!;
            const computed = lineResults[idx];
            return {
              productId: line.productId,
              itemName: product.name,
              hsnSac: product.hsnSac,
              quantity: qty(line.qty),
              unit: product.unit,
              rate: dec(product.price),
              discountPct: dec(line.discountPct ?? 0),
              taxPct: product.taxRate,
              gross: dec(computed.gross),
              discountAmt: dec(computed.discountAmt),
              taxableValue: dec(computed.taxableValue),
              taxAmt: dec(computed.taxAmt),
              lineTotal: dec(computed.lineTotal),
              sortOrder: idx,
            };
          }),
        },
      },
      update: {
        status: inv.status,
        grandTotal: dec(totals.grandTotal),
        amountInWords: totals.amountInWords,
        cgst: dec(totals.cgst),
        sgst: dec(totals.sgst),
        igst: dec(totals.igst),
      },
    });

    invoiceIds.set(inv.id, invoice.id);

    // Replace line items on re-seed for consistency.
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoiceLineItem.createMany({
      data: inv.lines.map((line, idx) => {
        const product = products.get(line.productId)!;
        const computed = lineResults[idx];
        return {
          invoiceId: invoice.id,
          productId: line.productId,
          itemName: product.name,
          hsnSac: product.hsnSac,
          quantity: qty(line.qty),
          unit: product.unit,
          rate: dec(product.price),
          discountPct: dec(line.discountPct ?? 0),
          taxPct: product.taxRate,
          gross: dec(computed.gross),
          discountAmt: dec(computed.discountAmt),
          taxableValue: dec(computed.taxableValue),
          taxAmt: dec(computed.taxAmt),
          lineTotal: dec(computed.lineTotal),
          sortOrder: idx,
        };
      }),
    });
  }

  const sentIntraId = invoiceIds.get('seed-invoice-sent-intra')!;
  const paidInvoiceId = invoiceIds.get('seed-invoice-paid')!;

  const sentIntraInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: sentIntraId } });
  const paidInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: paidInvoiceId } });

  await prisma.paymentLink.upsert({
    where: { razorpayLinkId: 'plink_seed_created_001' },
    create: {
      invoiceId: sentIntraId,
      razorpayLinkId: 'plink_seed_created_001',
      shortUrl: 'https://rzp.io/i/seed-created',
      amount: sentIntraInvoice.grandTotal,
      status: 'CREATED',
      expiresAt: new Date('2025-07-31'),
      createdById: accountantId,
    },
    update: {
      invoiceId: sentIntraId,
      status: 'CREATED',
      amount: sentIntraInvoice.grandTotal,
    },
  });

  const paidLink = await prisma.paymentLink.upsert({
    where: { razorpayLinkId: 'plink_seed_paid_001' },
    create: {
      invoiceId: paidInvoiceId,
      razorpayLinkId: 'plink_seed_paid_001',
      shortUrl: 'https://rzp.io/i/seed-paid',
      amount: paidInvoice.grandTotal,
      status: 'PAID',
      createdById: accountantId,
    },
    update: {
      invoiceId: paidInvoiceId,
      status: 'PAID',
      amount: paidInvoice.grandTotal,
    },
  });

  await prisma.payment.upsert({
    where: { razorpayPaymentId: 'pay_seed_captured_001' },
    create: {
      invoiceId: paidInvoiceId,
      paymentLinkId: paidLink.id,
      razorpayPaymentId: 'pay_seed_captured_001',
      razorpayOrderId: 'order_seed_001',
      amount: paidInvoice.grandTotal,
      currency: 'INR',
      method: 'upi',
      status: 'CAPTURED',
      capturedAt: new Date('2025-06-15T10:30:00Z'),
      rawPayload: { id: 'pay_seed_captured_001', status: 'captured', method: 'upi' },
    },
    update: {
      invoiceId: paidInvoiceId,
      paymentLinkId: paidLink.id,
      status: 'CAPTURED',
      amount: paidInvoice.grandTotal,
    },
  });

  const templateDefs = [
    {
      code: 'TPL_FRONT_DESK',
      name: 'Front Desk Receptionist',
      description: 'Limited customer and invoice visibility for reception staff',
      category: 'Operations',
      items: [
        { targetLevel: 'MENU_ITEM', targetId: 'NAV_DASHBOARD', mode: 'VISIBLE' },
        { targetLevel: 'MENU_ITEM', targetId: 'NAV_CUSTOMERS', mode: 'VISIBLE' },
        { targetLevel: 'MENU_ITEM', targetId: 'NAV_INVOICES', mode: 'VISIBLE' },
        { targetLevel: 'MODULE', targetId: 'CUSTOMERS', mode: 'VIEW' },
        { targetLevel: 'MODULE', targetId: 'INVOICES', mode: 'VIEW' },
        { targetLevel: 'ACTION', targetId: 'CUSTOMER.LIST', mode: 'ALLOW' },
        { targetLevel: 'ACTION', targetId: 'CUSTOMER.VIEW', mode: 'ALLOW' },
        { targetLevel: 'ACTION', targetId: 'INVOICE.LIST', mode: 'ALLOW' },
        { targetLevel: 'ACTION', targetId: 'INVOICE.VIEW', mode: 'ALLOW' },
        { targetLevel: 'LIST_COLUMN', targetId: 'COL_CUSTOMER_EMAIL', mode: 'MASKED', maskPattern: 'MASK_MIDDLE' },
        { targetLevel: 'LIST_COLUMN', targetId: 'COL_CUSTOMER_PHONE', mode: 'MASKED', maskPattern: 'MASK_LAST_4' },
      ],
    },
    {
      code: 'TPL_READ_ONLY_AUDITOR',
      name: 'Read-Only Auditor',
      description: 'Unmasked read access with audit log and report export',
      category: 'Compliance',
      items: [
        { targetLevel: 'MODULE', targetId: 'INVOICES', mode: 'VIEW' },
        { targetLevel: 'MODULE', targetId: 'CUSTOMERS', mode: 'VIEW' },
        { targetLevel: 'MODULE', targetId: 'PAYMENTS', mode: 'VIEW' },
        { targetLevel: 'ACTION', targetId: 'PRIVILEGE.AUDIT_VIEW', mode: 'ALLOW' },
        { targetLevel: 'REPORT', targetId: 'RPT_INVOICE_AGING', mode: 'EXPORT' },
        { targetLevel: 'REPORT', targetId: 'RPT_TAX_LIABILITY', mode: 'EXPORT' },
        { targetLevel: 'RECORD_SCOPE', targetId: 'INVOICES', mode: 'ALL' },
      ],
    },
    {
      code: 'TPL_FINANCE_APPROVER',
      name: 'Finance Approver',
      description: 'Finance edit access with approval handling for refunds and reversals',
      category: 'Finance',
      items: [
        { targetLevel: 'MODULE', targetId: 'INVOICES', mode: 'EDIT' },
        { targetLevel: 'MODULE', targetId: 'PAYMENTS', mode: 'EDIT' },
        { targetLevel: 'ACTION', targetId: 'PRIVILEGE.APPROVAL_HANDLE', mode: 'ALLOW' },
        { targetLevel: 'STATUS_TRANSITION', targetId: 'INVOICE.PAID_TO_CANCELLED', mode: 'ALLOW' },
        { targetLevel: 'ACTION', targetId: 'PAYMENT.REFUND', mode: 'ALLOW' },
        { targetLevel: 'RECORD_SCOPE', targetId: 'INVOICES', mode: 'ALL' },
        { targetLevel: 'RECORD_SCOPE', targetId: 'PAYMENTS', mode: 'ALL' },
      ],
    },
  ];

  for (const tpl of templateDefs) {
    const template = await prisma.privilegeTemplate.upsert({
      where: { code: tpl.code },
      create: {
        code: tpl.code,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        isSystem: true,
      },
      update: {
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        isSystem: true,
      },
    });

    await prisma.privilegeTemplateItem.deleteMany({ where: { templateId: template.id } });
    await prisma.privilegeTemplateItem.createMany({
      data: tpl.items.map((item) => ({
        templateId: template.id,
        targetLevel: item.targetLevel,
        targetId: item.targetId,
        mode: item.mode,
        maskPattern: 'maskPattern' in item ? item.maskPattern : undefined,
      })),
    });
  }

  await prisma.approvalRequest.upsert({
    where: { id: 'seed-approval-pending-cancel' },
    create: {
      id: 'seed-approval-pending-cancel',
      requesterId: accountantId,
      targetLevel: 'STATUS_TRANSITION',
      targetId: 'INVOICE.PAID_TO_CANCELLED',
      recordType: 'INVOICE',
      recordId: paidInvoiceId,
      payload: { invoiceNumber: 'INV-2025-0004', reason: 'Customer disputed charge' },
      status: 'PENDING',
    },
    update: {
      requesterId: accountantId,
      status: 'PENDING',
      recordId: paidInvoiceId,
    },
  });

  await prisma.approvalRequest.upsert({
    where: { id: 'seed-approval-approved-refund' },
    create: {
      id: 'seed-approval-approved-refund',
      requesterId: accountantId,
      targetLevel: 'ACTION',
      targetId: 'PAYMENT.REFUND',
      recordType: 'PAYMENT',
      recordId: 'pay_seed_captured_001',
      payload: { razorpayPaymentId: 'pay_seed_captured_001', amount: 10000, reason: 'Partial service cancellation' },
      status: 'APPROVED',
      approverId: adminId,
      approverNote: 'Approved after verifying customer email confirmation.',
      resolvedAt: new Date('2025-06-16T14:00:00Z'),
    },
    update: {
      status: 'APPROVED',
      approverId: adminId,
      resolvedAt: new Date('2025-06-16T14:00:00Z'),
    },
  });

  await prisma.invoiceSeries.upsert({
    where: { fiscalYear: '2025-26' },
    create: { fiscalYear: '2025-26', lastNumber: 5 },
    update: { lastNumber: 5 },
  });

  console.log('Recomputing effective privileges for all users…');
  for (const userId of userIds.values()) {
    await recomputeEffectivePrivileges(userId);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
