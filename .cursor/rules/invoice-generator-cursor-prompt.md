# Invoice Generator — Cursor Implementation Prompt
**Stack:**
- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Next.js Route Handlers (`app/api/**/route.ts`) + Server Actions where appropriate
- **Database:** PostgreSQL 16 + Prisma ORM
- **Background Jobs:** pg-boss (uses same Postgres DB — no Redis required)
- **Auth:** NextAuth.js (credentials provider + Prisma adapter)
- **Payments:** Razorpay (payment links + webhooks)
- **Forms:** React Hook Form + Zod
- **Data fetching (client):** TanStack Query
- **PDF generation:** `@react-pdf/renderer` (server) or `html2pdf.js` (client)

> **Scope note:** Single-installation build — no multi-tenancy, no subscription plans, no tenant scoping. Multi-tenancy can be layered on top later as an outer wrapper without touching this core.

This document has two parts:

- **PART A — UNIVERSAL PRIVILEGE SYSTEM** (15-level granularity; reusable across all future Accordex products)
- **PART B — INVOICE GENERATOR** (product-specific build + Razorpay payments)

> 🔁 **HOW TO REUSE PART A IN OTHER PRODUCTS**
> Every block of Part A is wrapped between the markers
> `<!-- ═══ COPY-START: PRIVILEGE ═══ -->` and `<!-- ═══ COPY-END: PRIVILEGE ═══ -->`.
> To use this privilege engine in another Next.js product: copy everything between those markers, replace the **Product Manifest** (§A.10) with the new product's modules/forms/fields, and the engine works as-is.

---

# PART A — UNIVERSAL PRIVILEGE SYSTEM (REUSABLE)

<!-- ═══ COPY-START: PRIVILEGE ═══ -->

## A.1 Design Goals

1. **Fifteen-level granularity.** Privileges apply at: menu item, module, form, tab, section, field, button, list column, list filter, bulk action, action, status transition, record scope, report, dashboard widget.
2. **Fully dynamic.** Every privilege is database-driven and editable in the Admin UI; no code changes, no redeploy.
3. **Deterministic resolver.** For any (user, target) pair the effective mode is a pure function of registry + role grants + user overrides.
4. **Audit-friendly.** Every grant/revoke logged with actor, target, before, after, reason.
5. **Reversible.** No destructive operations; everything has a rollback path.
6. **Templatable.** Common privilege bundles saved as templates and applied in one click.
7. **Previewable.** Admin can "view the app as user X" before saving changes.

## A.2 Privilege Vocabulary

### A.2.1 Target Levels

| Level | What it controls | Modes that apply |
|---|---|---|
| `MENU_ITEM` | Sidebar/header nav links | `HIDDEN`, `VISIBLE` |
| `MODULE` | Top-level functional area | `NO_ACCESS`, `VIEW`, `EDIT` |
| `FORM` | Specific data entry / edit screen | `NO_ACCESS`, `VIEW`, `EDIT` |
| `TAB` | A tab within a tabbed form | `HIDDEN`, `VIEW`, `EDIT` |
| `SECTION` | A logical group of fields | `HIDDEN`, `COLLAPSED`, `VIEW`, `EDIT` |
| `FIELD` | A single input or display field | `HIDDEN`, `MASKED`, `VIEW`, `EDIT`, `REQUIRED`, `OPTIONAL` |
| `BUTTON` | A specific button | `HIDDEN`, `DISABLED`, `VISIBLE` |
| `LIST_COLUMN` | A column in a table/list view | `HIDDEN`, `MASKED`, `VISIBLE` |
| `LIST_FILTER` | A filter option in a list | `HIDDEN`, `VISIBLE` |
| `BULK_ACTION` | A bulk operation on selected rows | `ALLOW`, `DENY`, `ALLOW_WITH_APPROVAL` |
| `ACTION` | An imperative verb on a module/record | `ALLOW`, `DENY`, `ALLOW_WITH_APPROVAL` |
| `STATUS_TRANSITION` | Moving a record from status A to status B | `ALLOW`, `DENY`, `ALLOW_WITH_APPROVAL` |
| `RECORD_SCOPE` | Which records the user can see | `OWN`, `TEAM`, `BRANCH`, `DEPARTMENT`, `ALL` |
| `REPORT` | A specific report | `HIDDEN`, `VIEW`, `EXPORT` |
| `DASHBOARD_WIDGET` | A widget on the dashboard | `HIDDEN`, `VISIBLE` |

### A.2.2 Access Modes (full reference)

| Mode | Meaning |
|---|---|
| `NO_ACCESS` | Hidden from nav; route handlers return 403 |
| `HIDDEN` | Not rendered |
| `COLLAPSED` | Visible but auto-collapsed (sections only) |
| `DISABLED` | Visible but greyed out (buttons only) |
| `VISIBLE` | Visible (menus, columns, widgets, filters) |
| `VIEW` | Visible but read-only |
| `EDIT` | Visible and writable |
| `MASKED` | Partial visibility per masking pattern |
| `REQUIRED` | Field must be filled (modifier) |
| `OPTIONAL` | Field can be empty (modifier) |
| `ALLOW` | Action permitted |
| `DENY` | Action explicitly blocked |
| `ALLOW_WITH_APPROVAL` | Action queued for approver |
| `OWN` / `TEAM` / `BRANCH` / `DEPARTMENT` / `ALL` | Record scope tiers |
| `EXPORT` | Report can be exported (in addition to view) |

### A.2.3 Field Masking Patterns

| Pattern | Example: `9876543210` → |
|---|---|
| `MASK_NONE` | `9876543210` |
| `MASK_LAST_4` | `******3210` |
| `MASK_FIRST_4` | `9876******` |
| `MASK_MIDDLE` | `j***@gmail.com` (for emails) |
| `MASK_FULL` | `**********` |
| `MASK_INITIAL` | `J. D.` (for names) |
| `MASK_CUSTOM:<regex>:<replace>` | Custom regex mask |

### A.2.4 Resolution Rules

1. If `user.isSuperAdmin` → return most permissive mode for every target.
2. Start with **registry default** for the target (most restrictive).
3. Walk role inheritance; collect grants from assigned role + all ancestor roles.
4. Apply grants with permissive union per level, EXCEPT `DENY` always wins.
5. Apply **User Overrides** as final word for that target.
6. For `RECORD_SCOPE`, broadest scope wins (`ALL` > `BRANCH` > `TEAM` > `OWN`) unless explicit override narrows it.
7. Time-bound grants with expired `validUntil` are ignored.
8. Conditional grants (`conditionExpr`) evaluate against record context at request time.

## A.3 Prisma Schema — Privilege Engine + NextAuth

```prisma
// =========================================================
// PRIVILEGE ENGINE + NEXTAUTH — prisma/schema.prisma
// =========================================================

generator client { provider = "prisma-client-js" }
datasource db    { provider = "postgresql"; url = env("DATABASE_URL") }

// ----- NEXTAUTH MODELS -----
// Required by NextAuth.js Prisma adapter.

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  name          String?
  image         String?
  passwordHash  String?           // for credentials provider
  isActive      Boolean   @default(true)
  isSuperAdmin  Boolean   @default(false)

  // Org / record-scope linkage
  teamId        String?
  team          Team?       @relation(fields: [teamId], references: [id])
  branchId      String?
  branch        Branch?     @relation(fields: [branchId], references: [id])
  departmentId  String?
  department    Department? @relation(fields: [departmentId], references: [id])
  managerId     String?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // NextAuth relations
  accounts      Account[]
  sessions      Session[]

  // Privilege relations
  roles            UserRole[]
  overrides        UserPrivilegeOverride[]
  approvalsRaised  ApprovalRequest[] @relation("Requester")
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// ----- ORG STRUCTURE -----

model Team       { id String @id @default(cuid()); name String; branchId String?; users User[] }
model Branch     { id String @id @default(cuid()); name String; users User[] }
model Department { id String @id @default(cuid()); name String; users User[] }

// ----- REGISTRY (seeded from product manifest) -----

model MenuItem {
  id        String  @id @default(cuid())
  code      String  @unique
  name      String
  icon      String?
  parentId  String?
  parent    MenuItem?  @relation("MenuTree", fields: [parentId], references: [id])
  children  MenuItem[] @relation("MenuTree")
  route     String?
  sortOrder Int     @default(0)
}

model Module {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  icon        String?
  sortOrder   Int      @default(0)
  forms       Form[]
  actions     ActionDef[]
  bulkActions BulkActionDef[]
  transitions StatusTransitionDef[]
  scopes      RecordScopeDef[]
  listColumns ListColumnDef[]
  listFilters ListFilterDef[]
}

model Form {
  id        String   @id @default(cuid())
  moduleId  String
  module    Module   @relation(fields: [moduleId], references: [id])
  code      String
  name      String
  sortOrder Int      @default(0)
  tabs      Tab[]
  sections  Section[]
  buttons   Button[]
  @@unique([moduleId, code])
}

model Tab {
  id        String   @id @default(cuid())
  formId    String
  form      Form     @relation(fields: [formId], references: [id])
  code      String
  name      String
  sortOrder Int      @default(0)
  sections  Section[]
  @@unique([formId, code])
}

model Section {
  id        String   @id @default(cuid())
  formId    String
  form      Form     @relation(fields: [formId], references: [id])
  tabId     String?
  tab       Tab?     @relation(fields: [tabId], references: [id])
  code      String
  name      String
  sortOrder Int      @default(0)
  fields    Field[]
  @@unique([formId, code])
}

model Field {
  id                 String   @id @default(cuid())
  sectionId          String
  section            Section  @relation(fields: [sectionId], references: [id])
  code               String
  name               String
  dataType           String   // TEXT | NUMBER | DATE | EMAIL | PHONE | SELECT | TEXTAREA | FILE | CURRENCY | RADIO
  defaultRequired    Boolean  @default(false)
  defaultMaskPattern String?
  isPii              Boolean  @default(false) // DPDP/GDPR flag
  sortOrder          Int      @default(0)
  @@unique([sectionId, code])
}

model Button {
  id        String   @id @default(cuid())
  formId    String
  form      Form     @relation(fields: [formId], references: [id])
  code      String
  name      String
  variant   String   @default("default")
  sortOrder Int      @default(0)
  @@unique([formId, code])
}

model ActionDef {
  id         String  @id @default(cuid())
  moduleId   String
  module     Module  @relation(fields: [moduleId], references: [id])
  code       String
  name       String
  isHighRisk Boolean @default(false)
  @@unique([moduleId, code])
}

model BulkActionDef {
  id         String  @id @default(cuid())
  moduleId   String
  module     Module  @relation(fields: [moduleId], references: [id])
  code       String
  name       String
  isHighRisk Boolean @default(true)
  @@unique([moduleId, code])
}

model StatusTransitionDef {
  id         String  @id @default(cuid())
  moduleId   String
  module     Module  @relation(fields: [moduleId], references: [id])
  code       String
  name       String
  fromStatus String
  toStatus   String
  @@unique([moduleId, code])
}

model RecordScopeDef {
  id              String  @id @default(cuid())
  moduleId        String
  module          Module  @relation(fields: [moduleId], references: [id])
  code            String  @default("DEFAULT")
  name            String
  ownerField      String?
  teamField       String?
  branchField     String?
  departmentField String?
}

model ListColumnDef {
  id                 String  @id @default(cuid())
  moduleId           String
  module             Module  @relation(fields: [moduleId], references: [id])
  code               String
  name               String
  fieldCode          String?
  defaultMaskPattern String?
  sortOrder          Int     @default(0)
  @@unique([moduleId, code])
}

model ListFilterDef {
  id        String  @id @default(cuid())
  moduleId  String
  module    Module  @relation(fields: [moduleId], references: [id])
  code      String
  name      String
  sortOrder Int     @default(0)
  @@unique([moduleId, code])
}

model ReportDef {
  id          String  @id @default(cuid())
  code        String  @unique
  name        String
  description String?
  category    String?
}

model DashboardWidgetDef {
  id          String  @id @default(cuid())
  code        String  @unique
  name        String
  description String?
}

// ----- ROLES & GRANTS -----

model Role {
  id           String   @id @default(cuid())
  code         String   @unique
  name         String
  description  String?
  isSystem     Boolean  @default(false)
  parentRoleId String?
  parentRole   Role?    @relation("RoleHierarchy", fields: [parentRoleId], references: [id])
  childRoles   Role[]   @relation("RoleHierarchy")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  grants       RolePrivilegeGrant[]
  userRoles    UserRole[]
}

model RolePrivilegeGrant {
  id            String   @id @default(cuid())
  roleId        String
  role          Role     @relation(fields: [roleId], references: [id])
  targetLevel   String
  targetId      String
  mode          String
  maskPattern   String?
  validFrom     DateTime?
  validUntil    DateTime?
  conditionExpr String?
  createdAt     DateTime @default(now())
  createdBy     String
  @@unique([roleId, targetLevel, targetId])
  @@index([roleId, targetLevel])
}

model UserRole {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  roleId     String
  role       Role     @relation(fields: [roleId], references: [id])
  validFrom  DateTime?
  validUntil DateTime?
  assignedAt DateTime @default(now())
  assignedBy String
  @@unique([userId, roleId])
}

model UserPrivilegeOverride {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  targetLevel String
  targetId    String
  mode        String
  maskPattern String?
  validFrom   DateTime?
  validUntil  DateTime?
  reason      String
  createdAt   DateTime @default(now())
  createdBy   String
  @@index([userId, targetLevel])
}

// ----- TEMPLATES -----

model PrivilegeTemplate {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  description String?
  category    String?
  isSystem    Boolean  @default(false)
  items       PrivilegeTemplateItem[]
  createdAt   DateTime @default(now())
}

model PrivilegeTemplateItem {
  id          String @id @default(cuid())
  templateId  String
  template    PrivilegeTemplate @relation(fields: [templateId], references: [id])
  targetLevel String
  targetId    String
  mode        String
  maskPattern String?
}

// ----- APPROVAL FLOW -----

model ApprovalRequest {
  id           String    @id @default(cuid())
  requesterId  String
  requester    User      @relation("Requester", fields: [requesterId], references: [id])
  targetLevel  String
  targetId     String
  recordType   String?
  recordId     String?
  payload      Json?
  status       String    @default("PENDING") // PENDING | APPROVED | REJECTED | EXPIRED
  approverId   String?
  approverNote String?
  requestedAt  DateTime  @default(now())
  resolvedAt   DateTime?
}

// ----- AUDIT -----

model PrivilegeAuditLog {
  id             String   @id @default(cuid())
  actorUserId    String
  action         String
  affectedRoleId String?
  affectedUserId String?
  targetLevel    String?
  targetId       String?
  oldMode        String?
  newMode        String?
  oldMask        String?
  newMask        String?
  reason         String?
  metadata       Json?
  createdAt      DateTime @default(now())
  @@index([createdAt])
  @@index([actorUserId])
  @@index([affectedUserId])
}

// ----- RESOLVED CACHE -----

model EffectivePrivilege {
  id          String   @id @default(cuid())
  userId      String
  targetLevel String
  targetId    String
  mode        String
  maskPattern String?
  computedAt  DateTime @default(now())
  @@unique([userId, targetLevel, targetId])
  @@index([userId])
}
```

## A.4 NextAuth Configuration

`lib/auth.ts`

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || !user.isActive || !user.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isSuperAdmin: user.isSuperAdmin,
          teamId: user.teamId,
          branchId: user.branchId,
          departmentId: user.departmentId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.teamId = (user as any).teamId;
        token.branchId = (user as any).branchId;
        token.departmentId = (user as any).departmentId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).isSuperAdmin = token.isSuperAdmin;
        (session.user as any).teamId = token.teamId;
        (session.user as any).branchId = token.branchId;
        (session.user as any).departmentId = token.departmentId;
      }
      return session;
    },
  },
});

// Type augmentation
declare module 'next-auth' {
  interface User { isSuperAdmin?: boolean; teamId?: string | null; branchId?: string | null; departmentId?: string | null; }
}
```

`app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

`middleware.ts` (Next.js root middleware — protects all routes except `/login`, `/register`, `/api/auth`, public assets)

```ts
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/razorpay/webhook') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');
  if (!isPublicPath && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

## A.5 Resolver Service

`lib/privilege/resolver.ts`

```ts
import { prisma } from '@/lib/prisma';

export type TargetLevel =
  | 'MENU_ITEM' | 'MODULE' | 'FORM' | 'TAB' | 'SECTION' | 'FIELD' | 'BUTTON'
  | 'LIST_COLUMN' | 'LIST_FILTER' | 'BULK_ACTION' | 'ACTION'
  | 'STATUS_TRANSITION' | 'RECORD_SCOPE' | 'REPORT' | 'DASHBOARD_WIDGET';

export type Mode =
  | 'NO_ACCESS' | 'HIDDEN' | 'COLLAPSED' | 'DISABLED' | 'VISIBLE'
  | 'VIEW' | 'EDIT' | 'MASKED' | 'REQUIRED' | 'OPTIONAL'
  | 'ALLOW' | 'DENY' | 'ALLOW_WITH_APPROVAL'
  | 'OWN' | 'TEAM' | 'BRANCH' | 'DEPARTMENT' | 'ALL' | 'EXPORT';

export interface ResolvedPrivilege {
  level: TargetLevel;
  targetId: string;
  mode: Mode;
  maskPattern?: string;
  requiresApproval?: boolean;
}

// Rebuilds EffectivePrivilege rows for one user across every registry target.
export async function resolveAllForUser(userId: string): Promise<ResolvedPrivilege[]> {
  // 1. Load user; if isSuperAdmin → return EDIT/ALLOW/ALL for every registry target.
  // 2. Load all role assignments for the user (filter validFrom/validUntil).
  // 3. Walk role inheritance — collect grants from role + all ancestor roles.
  // 4. Load user overrides (filter validFrom/validUntil).
  // 5. For each registry target:
  //      mode = registryDefault(level)
  //      for each grant: mode = merge(mode, grant)   // permissive union, DENY wins
  //      for each override: mode = applyOverride(mode, override)
  // 6. Upsert into EffectivePrivilege table for this user.
  // 7. Return the resolved list.
  return [];
}

export async function resolveOne(
  userId: string, level: TargetLevel, targetId: string,
): Promise<{ mode: Mode; maskPattern?: string }> {
  // Read EffectivePrivilege cache first; if missing, trigger rebuild and read again.
  return { mode: 'NO_ACCESS' };
}

export async function resolveForRecord(
  userId: string, level: TargetLevel, targetId: string, record: Record<string, unknown>,
): Promise<Mode> {
  // Evaluates conditionExpr (e.g., "record.status == 'DRAFT'") against record context.
  return 'NO_ACCESS';
}

// Permissive union; DENY always wins; broadest scope wins for RECORD_SCOPE.
function merge(current: Mode, incoming: Mode): Mode {
  // ...
  return current;
}
```

**Cache invalidation:** any change to Role / RolePrivilegeGrant / UserRole / UserPrivilegeOverride / registry sync enqueues a `privilege:recompute` pg-boss job for affected users.

## A.6 Route Handler Privilege Wrapper

`lib/privilege/withPrivilege.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveOne, Mode } from './resolver';

export interface PrivilegedContext {
  userId: string;
  isSuperAdmin: boolean;
  teamId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  recordScope?: { mode: Mode; userId: string; teamId?: string | null; branchId?: string | null; departmentId?: string | null };
}

interface GuardConfig {
  action?: string;
  module?: { code: string; min?: 'VIEW' | 'EDIT' };
  transition?: string;
  bulkAction?: string;
  applyRecordScope?: string;       // moduleCode — populates ctx.recordScope
}

type Handler = (req: NextRequest, ctx: PrivilegedContext) => Promise<NextResponse> | NextResponse;

export function withPrivilege(config: GuardConfig, handler: Handler) {
  return async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user as any;
    const ctx: PrivilegedContext = {
      userId: user.id,
      isSuperAdmin: !!user.isSuperAdmin,
      teamId: user.teamId,
      branchId: user.branchId,
      departmentId: user.departmentId,
    };

    if (!ctx.isSuperAdmin) {
      if (config.action) {
        const { mode } = await resolveOne(ctx.userId, 'ACTION', config.action);
        if (mode === 'DENY' || mode === 'NO_ACCESS') return forbidden(config.action);
        if (mode === 'ALLOW_WITH_APPROVAL') return pendingApproval();
      }
      if (config.module) {
        const { mode } = await resolveOne(ctx.userId, 'MODULE', config.module.code);
        const min = config.module.min ?? 'VIEW';
        if (mode === 'NO_ACCESS') return forbidden(config.module.code);
        if (min === 'EDIT' && mode === 'VIEW') return forbidden(config.module.code);
      }
      if (config.transition) {
        const { mode } = await resolveOne(ctx.userId, 'STATUS_TRANSITION', config.transition);
        if (mode === 'DENY') return forbidden(config.transition);
        if (mode === 'ALLOW_WITH_APPROVAL') return pendingApproval();
      }
      if (config.bulkAction) {
        const { mode } = await resolveOne(ctx.userId, 'BULK_ACTION', config.bulkAction);
        if (mode === 'DENY') return forbidden(config.bulkAction);
        if (mode === 'ALLOW_WITH_APPROVAL') return pendingApproval();
      }
      if (config.applyRecordScope) {
        const { mode } = await resolveOne(ctx.userId, 'RECORD_SCOPE', config.applyRecordScope);
        ctx.recordScope = { mode, userId: ctx.userId, teamId: ctx.teamId, branchId: ctx.branchId, departmentId: ctx.departmentId };
      }
    } else if (config.applyRecordScope) {
      ctx.recordScope = { mode: 'ALL', userId: ctx.userId };
    }

    return handler(req, ctx);
  };
}

function forbidden(code: string) {
  return NextResponse.json({ error: 'Forbidden', code }, { status: 403 });
}
function pendingApproval() {
  return NextResponse.json({ status: 'PENDING_APPROVAL', message: 'Action queued for approval' }, { status: 202 });
}
```

**Usage in a route handler:**

```ts
// app/api/invoices/route.ts
import { withPrivilege } from '@/lib/privilege/withPrivilege';
import { prisma } from '@/lib/prisma';
import { buildScopeWhere } from '@/lib/privilege/scope';
import { NextResponse } from 'next/server';

export const GET = withPrivilege(
  { action: 'INVOICE.LIST', applyRecordScope: 'INVOICES' },
  async (_req, ctx) => {
    const where = buildScopeWhere(ctx.recordScope!, { ownerField: 'createdById', teamField: 'teamId' });
    const invoices = await prisma.invoice.findMany({ where, orderBy: { invoiceDate: 'desc' } });
    return NextResponse.json(invoices);
  },
);

export const POST = withPrivilege(
  { action: 'INVOICE.CREATE' },
  async (req, ctx) => {
    const body = await req.json();
    // ...validate via Zod, scrub fields, create invoice...
    return NextResponse.json(invoice);
  },
);
```

`lib/privilege/scope.ts` — builds Prisma `where` clauses from a resolved `RECORD_SCOPE` mode:

```ts
import { PrivilegedContext } from './withPrivilege';

export function buildScopeWhere(
  scope: NonNullable<PrivilegedContext['recordScope']>,
  fields: { ownerField?: string; teamField?: string; branchField?: string; departmentField?: string },
): Record<string, unknown> {
  switch (scope.mode) {
    case 'ALL': return {};
    case 'BRANCH': return fields.branchField && scope.branchId ? { [fields.branchField]: scope.branchId } : { id: '__NEVER__' };
    case 'DEPARTMENT': return fields.departmentField && scope.departmentId ? { [fields.departmentField]: scope.departmentId } : { id: '__NEVER__' };
    case 'TEAM': return fields.teamField && scope.teamId ? { [fields.teamField]: scope.teamId } : { [fields.ownerField!]: scope.userId };
    case 'OWN':
    default: return fields.ownerField ? { [fields.ownerField]: scope.userId } : { id: '__NEVER__' };
  }
}
```

`lib/privilege/scrub.ts` — server-side field masking & request scrubbing:

```ts
// scrubResponse(payload, formCode, userPrivilegeMap) — removes HIDDEN fields, applies MASKED patterns
// scrubRequest(body, formCode, userPrivilegeMap)     — strips fields the user does not have EDIT on
```

## A.7 React Hooks & Components

`lib/privilege/usePrivilege.ts` (client-side)

```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import type { Mode, TargetLevel } from './resolver';

export interface PrivilegeMap {
  [key: string]: { mode: Mode; maskPattern?: string };
}

// Loaded once after login from GET /api/me/privileges, cached
export function usePrivilegeMap() {
  return useQuery<PrivilegeMap>({
    queryKey: ['me', 'privileges'],
    queryFn: () => fetch('/api/me/privileges').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

function readMode(map: PrivilegeMap | undefined, level: TargetLevel, code: string): { mode: Mode; maskPattern?: string } {
  return map?.[`${level}:${code}`] ?? { mode: 'HIDDEN' };
}

export const useFieldMode    = (code: string) => readMode(usePrivilegeMap().data, 'FIELD', code);
export const useSectionMode  = (code: string) => readMode(usePrivilegeMap().data, 'SECTION', code).mode;
export const useTabMode      = (code: string) => readMode(usePrivilegeMap().data, 'TAB', code).mode;
export const useButtonMode   = (code: string) => readMode(usePrivilegeMap().data, 'BUTTON', code).mode;
export const useColumnMode   = (code: string) => readMode(usePrivilegeMap().data, 'LIST_COLUMN', code);
export const useFilterMode   = (code: string) => readMode(usePrivilegeMap().data, 'LIST_FILTER', code).mode;
export const useMenuMode     = (code: string) => readMode(usePrivilegeMap().data, 'MENU_ITEM', code).mode;
export const useReportMode   = (code: string) => readMode(usePrivilegeMap().data, 'REPORT', code).mode;
export const useWidgetMode   = (code: string) => readMode(usePrivilegeMap().data, 'DASHBOARD_WIDGET', code).mode;
export const useScope        = (moduleCode: string) => readMode(usePrivilegeMap().data, 'RECORD_SCOPE', moduleCode).mode;

export function useCanDo(action: string) {
  const { mode } = readMode(usePrivilegeMap().data, 'ACTION', action);
  return { allowed: mode === 'ALLOW', requiresApproval: mode === 'ALLOW_WITH_APPROVAL' };
}
export const useCanTransition = (code: string) => {
  const { mode } = readMode(usePrivilegeMap().data, 'STATUS_TRANSITION', code);
  return { allowed: mode === 'ALLOW', requiresApproval: mode === 'ALLOW_WITH_APPROVAL' };
};
export const useCanBulk = (code: string) => {
  const { mode } = readMode(usePrivilegeMap().data, 'BULK_ACTION', code);
  return { allowed: mode === 'ALLOW', requiresApproval: mode === 'ALLOW_WITH_APPROVAL' };
};
```

**Components** (`components/privilege/*.tsx`)

```tsx
<Guarded module="INVOICES" min="VIEW">...</Guarded>
<Guarded action="INVOICE.DELETE">...</Guarded>
<Guarded field="CUSTOMER_GSTIN">...</Guarded>

<PrivilegeField code="CUSTOMER_PHONE" defaultRequired>
  <Input {...} />
</PrivilegeField>

<PrivilegeSection code="INVOICE_FOOTER">...</PrivilegeSection>
<PrivilegeTab code="CUSTOMER_TAX_TAB">...</PrivilegeTab>
<PrivilegeButton code="BTN_INVOICE_SAVE_DRAFT" onClick={...}>Save Draft</PrivilegeButton>
<PrivilegeColumn code="COL_INVOICE_AMOUNT">...</PrivilegeColumn>
<PrivilegeFilter code="FILTER_INVOICE_STATUS">...</PrivilegeFilter>

<MaskedValue value={value} pattern={maskPattern} />
<RequireApprovalButton action="INVOICE.MARK_PAID" onClick={...} />
```

Each component reads its mode from the privilege map and applies behaviour (hide / read-only / required / mask / etc.).

## A.8 Admin Management Module — 10 Screens

**Route prefix:** `/admin/privileges` (under the authenticated `(app)` segment).
All routes guarded by `requireAction('PRIVILEGE.MANAGE')` via `withPrivilege` on every API call.

| # | Screen | Route | Purpose |
|---|---|---|---|
| 1 | Roles List | `/admin/privileges/roles` | List, create, clone, delete roles |
| 2 | Role Editor (Permission Matrix) | `/admin/privileges/roles/[id]` | 15-tab matrix to set grants for every target level |
| 3 | Users List | `/admin/users` | List users with roles, overrides, last login |
| 4 | User Detail | `/admin/users/[id]` | Roles · Overrides · Effective Permissions · Activity · Approvals |
| 5 | Preview as User | `/admin/preview/[userId]` | Render UI with another user's permissions; writes blocked; logged |
| 6 | Privilege Templates | `/admin/privileges/templates` | Pre-built bundles; apply to role with conflict resolution |
| 7 | Approval Queue | `/admin/privileges/approvals` | Pending `ALLOW_WITH_APPROVAL` requests |
| 8 | Audit Log | `/admin/privileges/audit` | Filterable, exportable, immutable |
| 9 | Role Comparison | `/admin/privileges/roles/compare?a=&b=` | Side-by-side color-coded diff |
| 10 | Registry Inspector | `/admin/privileges/registry` | Read-only manifest view + Sync Registry button |

### Role Editor — 15 tabs (one per target level)

Each tab provides:
- Bulk "set all to X" per group
- Per-row time-bound grant (validFrom / validUntil pickers)
- Per-row condition expression with syntax help
- Inline diff vs. parent role (if inheritance active)
- Search box to filter targets
- Sticky footer with Discard / Save

The mode dropdown per row only shows modes valid for that target level (see §A.2.1).

## A.9 Route Handler API (under `app/api/privilege/**/route.ts`)

All write routes wrapped with `withPrivilege({ action: 'PRIVILEGE.MANAGE' }, …)`.

```
GET    /api/privilege/registry                            full tree
POST   /api/privilege/registry/sync                       re-seed from manifest
GET    /api/privilege/registry/[level]                    one level at a time

GET    /api/privilege/roles
POST   /api/privilege/roles
GET    /api/privilege/roles/[id]
PATCH  /api/privilege/roles/[id]
DELETE /api/privilege/roles/[id]
POST   /api/privilege/roles/[id]/clone
GET    /api/privilege/roles/[id]/grants
PUT    /api/privilege/roles/[id]/grants                   bulk upsert
DELETE /api/privilege/roles/[id]/grants/[grantId]
GET    /api/privilege/roles/compare?a=&b=

GET    /api/privilege/users
GET    /api/privilege/users/[id]
GET    /api/privilege/users/[id]/roles
POST   /api/privilege/users/[id]/roles
DELETE /api/privilege/users/[id]/roles/[roleId]
GET    /api/privilege/users/[id]/overrides
POST   /api/privilege/users/[id]/overrides
DELETE /api/privilege/users/[id]/overrides/[overrideId]
GET    /api/privilege/users/[id]/effective
POST   /api/privilege/users/[id]/preview

GET    /api/privilege/templates
POST   /api/privilege/templates
GET    /api/privilege/templates/[id]
DELETE /api/privilege/templates/[id]
POST   /api/privilege/templates/[id]/apply

GET    /api/privilege/approvals?status=PENDING
POST   /api/privilege/approvals/[id]/approve
POST   /api/privilege/approvals/[id]/reject

GET    /api/privilege/audit
GET    /api/privilege/audit/[id]
GET    /api/privilege/audit/export

# Self (no admin guard — just authentication)
GET    /api/me/privileges
GET    /api/me/approval-requests
POST   /api/me/approval-requests
```

## A.10 Built-in System Roles (seed)

| Code | Description |
|---|---|
| `SUPER_ADMIN` | Bypasses all checks; single instance |
| `ADMIN` | Full access to all modules + privilege management |
| `MANAGER` | Full business access; no privilege mgmt; no destructive bulk actions |
| `STAFF` | View/edit own + team records; no delete |
| `VIEWER` | Read-only with PII fields masked |
| `AUDITOR` | Read-only + full audit log access |

System roles are non-deletable; grants are editable with a reset-to-defaults action.

## A.11 Product Manifest — THE ONLY FILE THAT CHANGES PER PRODUCT

```ts
// lib/privilege/manifest.ts (per-product seed source)
export interface ProductManifest {
  product: { code: string; name: string };
  menuItems: MenuItemDef[];
  modules: ModuleDef[];
  reports: ReportDef[];
  dashboardWidgets: WidgetDef[];
}
// ... full type definitions for ModuleDef, FormDef, SectionDef, FieldDef, etc.
```

The Invoice Generator's full manifest is in **Part B §B.9**.

## A.12 Background Jobs (pg-boss)

`lib/jobs/queue.ts`

```ts
import PgBoss from 'pg-boss';
let boss: PgBoss | null = null;
export async function getBoss() {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
  }
  return boss;
}
```

`lib/jobs/worker.ts` (run as a separate Node process: `node -r tsx lib/jobs/worker.ts`)

```ts
import { getBoss } from './queue';
import { recomputeEffectivePrivileges } from './handlers/privilege-recompute';
import { expireTimedGrants } from './handlers/grant-expiry';
import { expirePendingApprovals } from './handlers/approval-expiry';
import { reconcileRazorpayPayments } from './handlers/razorpay-reconcile';

async function main() {
  const boss = await getBoss();

  // On-demand jobs
  await boss.work('privilege:recompute', async (job) => {
    await recomputeEffectivePrivileges(job.data.userId);
  });

  // Scheduled jobs (cron)
  await boss.schedule('privilege:expire-grants', '*/5 * * * *');     // every 5 min
  await boss.work('privilege:expire-grants', expireTimedGrants);

  await boss.schedule('approval:expire-pending', '0 * * * *');       // hourly
  await boss.work('approval:expire-pending', expirePendingApprovals);

  await boss.schedule('razorpay:reconcile', '0 */2 * * *');          // every 2 hours
  await boss.work('razorpay:reconcile', reconcileRazorpayPayments);

  console.log('Worker started');
}
main();
```

**Enqueue from route handlers:**

```ts
import { getBoss } from '@/lib/jobs/queue';
await (await getBoss()).send('privilege:recompute', { userId });
```

**Jobs used by the privilege engine:**

| Job | Trigger | Purpose |
|---|---|---|
| `privilege:recompute` | Role/grant/userRole/override change | Rebuild EffectivePrivilege for affected users |
| `privilege:expire-grants` | Every 5 min cron | Recompute users whose grants just expired |
| `approval:expire-pending` | Hourly cron | Mark approval requests older than 7 days as EXPIRED |
| `audit:archive` | Nightly cron | Move audit rows older than 1 year to cold storage |

## A.13 Performance Notes

- `/api/me/privileges` is cached via TanStack Query for 5 minutes; refetched on logout/role change.
- `EffectivePrivilege` is the single-query runtime source for the frontend payload.
- Recompute is async via pg-boss; UI shows "permissions refreshing" toast.
- Audit writes are best-effort async (don't block the user action).
- Postgres indexes on `(userId, targetLevel)` for fast resolver lookups.

<!-- ═══ COPY-END: PRIVILEGE ═══ -->

---

# PART B — INVOICE GENERATOR (PRODUCT-SPECIFIC)

## B.1 Project Setup

Next.js 14 App Router monolith — frontend, route handlers (API), and shared code all in one app.

```
/app
  /(auth)
    /login/page.tsx
    /register/page.tsx
  /(app)
    /layout.tsx                          # sidebar + topbar; requires session
    /dashboard/page.tsx
    /invoices
      /page.tsx                          # list
      /new/page.tsx                      # create
      /[id]/edit/page.tsx                # edit
      /[id]/preview/page.tsx             # preview + PDF download
    /customers
      /page.tsx
      /new/page.tsx
      /[id]/edit/page.tsx
    /products
      /page.tsx
      /new/page.tsx
      /[id]/edit/page.tsx
    /payments
      /page.tsx                          # payment list / status
      /[id]/page.tsx                     # one payment
    /reports/page.tsx
    /settings
      /company/page.tsx
      /privileges                        # admin module — see Part A §A.8
        /roles/page.tsx
        /roles/[id]/page.tsx
        /templates/page.tsx
        /approvals/page.tsx
        /audit/page.tsx
        /registry/page.tsx
      /users/page.tsx
      /users/[id]/page.tsx

  /api
    /auth/[...nextauth]/route.ts
    /me/privileges/route.ts
    /me/approval-requests/route.ts
    /privilege/...                       # see Part A §A.9
    /company/route.ts
    /customers/route.ts
    /customers/[id]/route.ts
    /customers/bulk/[op]/route.ts
    /products/route.ts
    /products/[id]/route.ts
    /products/bulk/[op]/route.ts
    /invoices/route.ts
    /invoices/[id]/route.ts
    /invoices/[id]/duplicate/route.ts
    /invoices/[id]/pdf/route.ts
    /invoices/[id]/transition/route.ts
    /invoices/[id]/payment-link/route.ts # generate Razorpay payment link
    /invoices/bulk/[op]/route.ts
    /razorpay/webhook/route.ts           # PUBLIC — signature-verified
    /reports/[code]/route.ts
    /dashboard/widgets/route.ts

/components
  /ui                                    # shadcn-generated
  /privilege                             # Guarded, PrivilegeField, etc.
  /invoices                              # InvoiceForm, LineItemTable, TotalsPanel
  /customers
  /products
  /payments
  /shared                                # DataTable, ConfirmDialog, MaskedValue

/lib
  /prisma.ts                             # PrismaClient singleton
  /auth.ts                               # NextAuth config (Part A §A.4)
  /privilege/
    resolver.ts
    withPrivilege.ts
    scope.ts
    scrub.ts
    usePrivilege.ts
    manifest.ts                          # product manifest (Part B §B.9)
  /jobs/
    queue.ts                             # pg-boss client
    worker.ts                            # worker process entry
    handlers/
      privilege-recompute.ts
      grant-expiry.ts
      approval-expiry.ts
      razorpay-reconcile.ts
      invoice-payment-reminder.ts
  /razorpay/
    client.ts                            # Razorpay SDK init
    payment-link.ts                      # create payment link from invoice
    webhook.ts                           # signature verification + event mapping
  /calc.ts                               # invoice calculations
  /pdf/
    invoice.tsx                          # @react-pdf/renderer template
  /validation/                           # Zod schemas
    invoice.ts
    customer.ts
    product.ts

/prisma
  schema.prisma                          # privilege schema (A.3) + invoice schema (B.2)
  seed.ts                                # registry + system roles + sample data

middleware.ts                            # auth gate (Part A §A.4)
.env.example
```

**Dev commands:**
```
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev                                 # Next.js dev server (port 3000)
pnpm worker                              # separate terminal: pg-boss worker
```

**`.env.example`:**
```
DATABASE_URL="postgresql://user:pass@localhost:5432/invoice_dev"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate via openssl rand -base64 32>"
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
APP_BASE_URL="http://localhost:3000"
```

## B.2 Prisma Schema — Invoice Domain

```prisma
model Company {
  id              String   @id @default(cuid())
  name            String
  logoUrl         String?
  email           String
  phone           String
  gstin           String?
  pan             String?
  addressLine1    String
  addressLine2    String?
  city            String
  state           String
  pincode         String
  country         String   @default("India")
  defaultCurrency String   @default("INR")
  bankName        String?
  accountNumber   String?
  ifsc            String?
  updatedAt       DateTime @updatedAt
}

model Customer {
  id              String   @id @default(cuid())
  name            String
  type            String   // 'INDIVIDUAL' | 'BUSINESS'
  email           String
  phone           String
  gstin           String?
  billingAddress  String
  shippingAddress String?
  city            String
  state           String
  pincode         String
  notes           String?
  isActive        Boolean  @default(true)

  // Record-scope columns
  createdById     String
  teamId          String?
  branchId        String?
  departmentId    String?

  invoices        Invoice[]
  createdAt       DateTime @default(now())
  @@index([name])
  @@index([createdById])
  @@index([teamId])
}

model Product {
  id           String   @id @default(cuid())
  name         String
  type         String   // 'PRODUCT' | 'SERVICE'
  sku          String?  @unique
  description  String?
  hsnSac       String?
  unit         String
  sellingPrice Decimal  @db.Decimal(12,2)
  taxRate      Int      // 0,5,12,18,28
  category     String?
  isActive     Boolean  @default(true)
  createdById  String
  createdAt    DateTime @default(now())
  @@index([name])
}

model Invoice {
  id              String   @id @default(cuid())
  invoiceNumber   String   @unique
  invoiceDate     DateTime
  dueDate         DateTime
  referenceNo     String?
  paymentTerms    String
  customerId      String
  customer        Customer @relation(fields: [customerId], references: [id])
  billingAddress  String
  shippingAddress String?
  lineItems       InvoiceLineItem[]

  subtotal        Decimal  @db.Decimal(14,2)
  totalDiscount   Decimal  @db.Decimal(14,2)
  taxableAmount   Decimal  @db.Decimal(14,2)
  cgst            Decimal  @db.Decimal(14,2) @default(0)
  sgst            Decimal  @db.Decimal(14,2) @default(0)
  igst            Decimal  @db.Decimal(14,2) @default(0)
  shippingCharges Decimal  @db.Decimal(14,2) @default(0)
  roundOff        Decimal  @db.Decimal(14,2) @default(0)
  grandTotal      Decimal  @db.Decimal(14,2)
  amountInWords   String

  notes           String?
  terms           String?
  status          String   @default("DRAFT") // DRAFT | SENT | PARTIALLY_PAID | PAID | CANCELLED
  attachmentUrl   String?

  // Record-scope columns
  createdById     String
  teamId          String?
  branchId        String?
  departmentId    String?

  // Razorpay linkage
  payments        Payment[]
  paymentLinks    PaymentLink[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([status, invoiceDate])
  @@index([createdById])
  @@index([customerId])
}

model InvoiceLineItem {
  id           String  @id @default(cuid())
  invoiceId    String
  invoice      Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  productId    String?
  itemName     String
  description  String?
  hsnSac       String?
  quantity     Decimal @db.Decimal(12,3)
  unit         String
  rate         Decimal @db.Decimal(12,2)
  discountPct  Decimal @db.Decimal(5,2) @default(0)
  taxPct       Int
  gross        Decimal @db.Decimal(14,2)
  discountAmt  Decimal @db.Decimal(14,2)
  taxableValue Decimal @db.Decimal(14,2)
  taxAmt       Decimal @db.Decimal(14,2)
  lineTotal    Decimal @db.Decimal(14,2)
  sortOrder    Int     @default(0)
}

// ----- RAZORPAY MODELS -----

model PaymentLink {
  id                  String   @id @default(cuid())
  invoiceId           String
  invoice             Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  razorpayLinkId      String   @unique           // 'plink_xxx'
  shortUrl            String
  amount              Decimal  @db.Decimal(14,2)
  currency            String   @default("INR")
  status              String   @default("CREATED") // CREATED | PARTIALLY_PAID | PAID | CANCELLED | EXPIRED
  expiresAt           DateTime?
  createdById         String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@index([invoiceId])
}

model Payment {
  id                String   @id @default(cuid())
  invoiceId         String
  invoice           Invoice  @relation(fields: [invoiceId], references: [id])
  paymentLinkId     String?
  razorpayPaymentId String   @unique             // 'pay_xxx'
  razorpayOrderId   String?
  amount            Decimal  @db.Decimal(14,2)
  currency          String   @default("INR")
  method            String?                       // 'card' | 'upi' | 'netbanking' | 'wallet'
  status            String                        // CAPTURED | AUTHORIZED | FAILED | REFUNDED
  fee               Decimal? @db.Decimal(14,2)
  tax               Decimal? @db.Decimal(14,2)
  capturedAt        DateTime?
  rawPayload        Json
  createdAt         DateTime @default(now())
  @@index([invoiceId])
  @@index([status])
}

model RazorpayWebhookEvent {
  id              String   @id @default(cuid())
  razorpayEventId String   @unique
  eventType       String
  processedAt     DateTime?
  payload         Json
  signature       String
  receivedAt      DateTime @default(now())
  @@index([eventType])
}
```

## B.3 Calculation Module

`lib/calc.ts` — pure, unit-tested TypeScript.

```ts
export interface LineInput { qty: number; rate: number; discountPct: number; taxPct: number; }
export interface LineResult { gross: number; discountAmt: number; taxableValue: number; taxAmt: number; lineTotal: number; }

export function calcLine({ qty, rate, discountPct, taxPct }: LineInput): LineResult {
  const gross = round2(qty * rate);
  const discountAmt = round2(gross * (discountPct / 100));
  const taxableValue = round2(gross - discountAmt);
  const taxAmt = round2(taxableValue * (taxPct / 100));
  const lineTotal = round2(taxableValue + taxAmt);
  return { gross, discountAmt, taxableValue, taxAmt, lineTotal };
}

export interface InvoiceCalcOpts { customerState: string; companyState: string; shipping: number; roundOff: number; }
export function calcInvoice(lines: LineInput[], opts: InvoiceCalcOpts) {
  // Returns: { subtotal, totalDiscount, taxableAmount, totalTax, cgst, sgst, igst, shippingCharges, roundOff, grandTotal, amountInWords }
}

export function amountInWordsINR(amount: number): string { /* lakhs/crores */ return ''; }
export function formatINR(amount: number): string { /* 1,00,000.00 */ return ''; }
function round2(n: number) { return Math.round(n * 100) / 100; }
```

**Edge cases:** zero qty/rate, 3-decimal qty, ≥1 crore amounts, negative round-off, mixed tax rates, 100% line discount.

## B.4 Modules

Every UI form field wrapped in `<PrivilegeField>`; sections in `<PrivilegeSection>`; buttons in `<PrivilegeButton>`; list columns in `<PrivilegeColumn>`. All list queries pass through `withPrivilege({ applyRecordScope })`.

### B.4.1 Company Profile (`/settings/company`)
Module `COMPANY_PROFILE`. Single record, no list, no scope.

### B.4.2 Customers (`/customers`)
Module `CUSTOMERS`. Full CRUD + bulk delete/export. `RECORD_SCOPE` honoured. "Same as Billing" copies addresses. GSTIN required only when type=BUSINESS.

### B.4.3 Product Catalog (`/products`)
Module `PRODUCTS`. Full CRUD + bulk import (CSV) / delete / export.

### B.4.4 Invoice Creation (`/invoices/new`, `/invoices/[id]/edit`)

Module `INVOICES`. The heaviest screen. 5 sections via `<PrivilegeSection>`:

| Section | Contents |
|---|---|
| `INVOICE_HEADER` | Invoice Number (auto `INV-YYYY-NNNN`), Date, Due Date, Reference, Payment Terms |
| `INVOICE_CUSTOMER` | Searchable customer dropdown + Quick Add modal; auto-populates billing/shipping with override |
| `INVOICE_LINE_ITEMS` | Dynamic editable table with add/delete rows and live calc |
| `INVOICE_TOTALS` | Subtotal, Discount, Taxable, CGST/SGST or IGST, Shipping, Round Off, Grand Total, Amount in Words |
| `INVOICE_FOOTER` | Notes, Terms, Status, Attachment |

**Form-level buttons:** `BTN_INVOICE_SAVE_DRAFT`, `BTN_INVOICE_SAVE_PREVIEW`, `BTN_INVOICE_CANCEL`, `BTN_INVOICE_ADD_LINE`, `BTN_INVOICE_DELETE_LINE`, `BTN_INVOICE_DOWNLOAD_PDF`, `BTN_INVOICE_PRINT`, `BTN_INVOICE_GENERATE_PAYMENT_LINK`.

**State:** React Hook Form + Zod (`lib/validation/invoice.ts`). Recompute totals on every line change via `useWatch`.

### B.4.5 Invoice Listing (`/invoices`)
Landing page after login. Top metrics card (count + total amount, respects scope). Columns, filters, search, sort, pagination 10/25/50.

### B.4.6 Invoice Preview & PDF (`/invoices/[id]/preview`)
A4 layout, print CSS, 15mm margins, logo base64-embedded. PDF generated via `@react-pdf/renderer` on server (`/api/invoices/[id]/pdf`).

### B.4.7 Payments (`/payments`) — **NEW: Razorpay-driven**
Module `PAYMENTS`. Lists all `Payment` and `PaymentLink` records linked to invoices.

- **Columns:** Invoice #, Customer, Amount, Method, Status, Captured At, Razorpay Payment ID (masked by default)
- **Filters:** Status, Date range, Method, Invoice
- **Row actions:** View Invoice, View Razorpay (opens dashboard), Initiate Refund (requires `PAYMENT.REFUND` action)
- **Form-level button:** `BTN_GENERATE_PAYMENT_LINK` on an invoice → calls `POST /api/invoices/[id]/payment-link`

## B.5 Auto-Numbering

Fetch latest invoice, parse `INV-YYYY-NNNN`, increment. Editable by user; uniqueness validated on save. Counter resets at Indian FY boundary (April 1).

## B.6 GST Logic

```ts
export function gstSplit(taxAmt: number, companyState: string, customerState: string) {
  if (companyState === customerState) return { cgst: taxAmt / 2, sgst: taxAmt / 2, igst: 0 };
  return { cgst: 0, sgst: 0, igst: taxAmt };
}
```

## B.7 Razorpay Integration

### B.7.1 Client setup — `lib/razorpay/client.ts`

```ts
import Razorpay from 'razorpay';

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});
```

### B.7.2 Create Payment Link — `lib/razorpay/payment-link.ts`

```ts
import { razorpay } from './client';
import { prisma } from '@/lib/prisma';

export async function createPaymentLinkForInvoice(invoiceId: string, createdById: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });
  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
    throw new Error('Cannot create payment link for ' + invoice.status + ' invoice');
  }

  const amountPaise = Math.round(Number(invoice.grandTotal) * 100);

  const link = await razorpay.paymentLink.create({
    amount: amountPaise,
    currency: 'INR',
    accept_partial: false,
    description: `Invoice ${invoice.invoiceNumber}`,
    customer: {
      name: invoice.customer.name,
      email: invoice.customer.email,
      contact: invoice.customer.phone,
    },
    notify: { sms: true, email: true },
    reminder_enable: true,
    notes: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
    callback_url: `${process.env.APP_BASE_URL}/invoices/${invoice.id}/preview`,
    callback_method: 'get',
  });

  return prisma.paymentLink.create({
    data: {
      invoiceId: invoice.id,
      razorpayLinkId: link.id,
      shortUrl: link.short_url,
      amount: invoice.grandTotal,
      currency: 'INR',
      status: 'CREATED',
      createdById,
    },
  });
}
```

### B.7.3 Webhook Handler — `app/api/razorpay/webhook/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature !== expected) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const eventId = req.headers.get('x-razorpay-event-id') || `${event.event}_${event.created_at}`;

  // Idempotency: skip if already processed
  const existing = await prisma.razorpayWebhookEvent.findUnique({ where: { razorpayEventId: eventId } });
  if (existing?.processedAt) return NextResponse.json({ ok: true, duplicate: true });

  await prisma.razorpayWebhookEvent.upsert({
    where: { razorpayEventId: eventId },
    update: {},
    create: { razorpayEventId: eventId, eventType: event.event, payload: event, signature },
  });

  switch (event.event) {
    case 'payment_link.paid':       await handlePaymentLinkPaid(event); break;
    case 'payment_link.cancelled':  await handlePaymentLinkCancelled(event); break;
    case 'payment_link.expired':    await handlePaymentLinkExpired(event); break;
    case 'payment.captured':        await handlePaymentCaptured(event); break;
    case 'payment.failed':          await handlePaymentFailed(event); break;
    case 'refund.processed':        await handleRefundProcessed(event); break;
  }

  await prisma.razorpayWebhookEvent.update({
    where: { razorpayEventId: eventId },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// Handler stubs — each maps Razorpay event → Payment / PaymentLink row + Invoice status transition
async function handlePaymentLinkPaid(event: any) { /* mark PaymentLink PAID, create Payment, transition Invoice to PAID */ }
async function handlePaymentLinkCancelled(event: any) { /* ... */ }
async function handlePaymentLinkExpired(event: any) { /* ... */ }
async function handlePaymentCaptured(event: any) { /* upsert Payment row */ }
async function handlePaymentFailed(event: any) { /* upsert Payment row with FAILED status */ }
async function handleRefundProcessed(event: any) { /* upsert Payment row with REFUNDED status */ }
```

**Webhook route is excluded from the auth middleware** (see `middleware.ts` matcher in §A.4). Razorpay does not log in; signature verification is the auth.

### B.7.4 Reconciliation Job (pg-boss)

`lib/jobs/handlers/razorpay-reconcile.ts` — runs every 2 hours; fetches `payment_link.fetch` for any `PaymentLink` not in a terminal state and reconciles.

### B.7.5 Status mapping

| Razorpay Event | Action |
|---|---|
| `payment_link.paid` | `PaymentLink.status = PAID`; create `Payment` row; invoke transition `INVOICE.SENT_TO_PAID` |
| `payment.captured` | `Payment.status = CAPTURED`; mark `capturedAt`; if PaymentLink terminal → transition invoice |
| `payment.failed` | `Payment.status = FAILED`; no invoice status change |
| `payment_link.cancelled` | `PaymentLink.status = CANCELLED` |
| `payment_link.expired` | `PaymentLink.status = EXPIRED` |
| `refund.processed` | `Payment.status = REFUNDED` |

### B.7.6 Privilege wiring for payments

New module `PAYMENTS` in the manifest (§B.9) with actions:
- `PAYMENT.LIST`, `PAYMENT.VIEW`, `PAYMENT.REFUND` (high-risk)
- `PAYMENT_LINK.CREATE`, `PAYMENT_LINK.CANCEL`
- Bulk: `PAYMENT.BULK_EXPORT`

Razorpay Payment ID is treated as PII (default mask `MASK_LAST_4` in list column).

## B.8 API Routes (Route Handlers)

All under `app/api/**/route.ts`. Examples:

```ts
// app/api/invoices/route.ts
export const GET  = withPrivilege({ action: 'INVOICE.LIST', applyRecordScope: 'INVOICES' }, listInvoices);
export const POST = withPrivilege({ action: 'INVOICE.CREATE' }, createInvoice);

// app/api/invoices/[id]/route.ts
export const GET    = withPrivilege({ action: 'INVOICE.VIEW' }, getInvoice);
export const PATCH  = withPrivilege({ action: 'INVOICE.EDIT' }, updateInvoice);
export const DELETE = withPrivilege({ action: 'INVOICE.DELETE' }, deleteInvoice);

// app/api/invoices/[id]/transition/route.ts
// body: { transitionCode: 'INVOICE.SENT_TO_PAID' }
export const POST = async (req, ctx) => {
  const body = await req.json();
  return withPrivilege({ transition: body.transitionCode }, transitionInvoice)(req, ctx);
};

// app/api/invoices/[id]/payment-link/route.ts
export const POST = withPrivilege({ action: 'PAYMENT_LINK.CREATE' }, generatePaymentLink);

// app/api/invoices/bulk/[op]/route.ts — op = 'send' | 'mark-paid' | 'export' | 'delete'
export const POST = (req, { params }) =>
  withPrivilege({ bulkAction: `INVOICE.BULK_${params.op.toUpperCase()}` }, bulkInvoiceOp)(req, { params });

// app/api/razorpay/webhook/route.ts
// NO withPrivilege — uses signature verification (see §B.7.3)
```

Full route list mirrors the privilege manifest (Part B §B.9).

## B.9 Product Manifest — Invoice Generator

`lib/privilege/manifest.ts`

```ts
import type { ProductManifest } from './types';

export const invoiceManifest: ProductManifest = {
  product: { code: 'INVOICE', name: 'Invoice Generator' },

  menuItems: [
    { code: 'NAV_DASHBOARD', name: 'Dashboard', icon: 'home', route: '/dashboard', sortOrder: 1 },
    { code: 'NAV_INVOICES', name: 'Invoices', icon: 'file-text', route: '/invoices', sortOrder: 2 },
    { code: 'NAV_CUSTOMERS', name: 'Customers', icon: 'users', route: '/customers', sortOrder: 3 },
    { code: 'NAV_PRODUCTS', name: 'Products', icon: 'package', route: '/products', sortOrder: 4 },
    { code: 'NAV_PAYMENTS', name: 'Payments', icon: 'credit-card', route: '/payments', sortOrder: 5 },
    { code: 'NAV_REPORTS', name: 'Reports', icon: 'bar-chart', route: '/reports', sortOrder: 6 },
    { code: 'NAV_SETTINGS', name: 'Settings', icon: 'settings', route: '/settings', sortOrder: 7 },
    { code: 'NAV_SETTINGS_COMPANY', name: 'Company Profile', parentCode: 'NAV_SETTINGS', route: '/settings/company', sortOrder: 1 },
    { code: 'NAV_SETTINGS_PRIVILEGES', name: 'Roles & Permissions', parentCode: 'NAV_SETTINGS', route: '/settings/privileges/roles', sortOrder: 2 },
    { code: 'NAV_SETTINGS_USERS', name: 'Users', parentCode: 'NAV_SETTINGS', route: '/settings/users', sortOrder: 3 },
  ],

  modules: [
    // 1. COMPANY_PROFILE — identity, tax, address, financial
    { code: 'COMPANY_PROFILE', name: 'Company Profile', icon: 'building', sortOrder: 1,
      forms: [{ code: 'COMPANY_PROFILE_FORM', name: 'Company Profile',
        sections: [
          { code: 'COMPANY_IDENTITY', name: 'Identity', fields: [
            { code: 'COMPANY_NAME', name: 'Company Name', dataType: 'TEXT', defaultRequired: true },
            { code: 'COMPANY_LOGO', name: 'Logo', dataType: 'FILE' },
            { code: 'COMPANY_EMAIL', name: 'Business Email', dataType: 'EMAIL', defaultRequired: true, isPii: true, defaultMaskPattern: 'MASK_MIDDLE' },
            { code: 'COMPANY_PHONE', name: 'Phone', dataType: 'PHONE', defaultRequired: true, isPii: true, defaultMaskPattern: 'MASK_LAST_4' },
          ]},
          { code: 'COMPANY_TAX', name: 'Tax Info', fields: [
            { code: 'COMPANY_GSTIN', name: 'GSTIN', dataType: 'TEXT', isPii: true, defaultMaskPattern: 'MASK_LAST_4' },
            { code: 'COMPANY_PAN', name: 'PAN', dataType: 'TEXT', isPii: true, defaultMaskPattern: 'MASK_LAST_4' },
          ]},
          { code: 'COMPANY_ADDRESS', name: 'Address', fields: [
            { code: 'COMPANY_ADDRESS1', name: 'Address Line 1', dataType: 'TEXT', defaultRequired: true },
            { code: 'COMPANY_ADDRESS2', name: 'Address Line 2', dataType: 'TEXT' },
            { code: 'COMPANY_CITY', name: 'City', dataType: 'TEXT', defaultRequired: true },
            { code: 'COMPANY_STATE', name: 'State', dataType: 'SELECT', defaultRequired: true },
            { code: 'COMPANY_PINCODE', name: 'Pincode', dataType: 'TEXT', defaultRequired: true },
            { code: 'COMPANY_COUNTRY', name: 'Country', dataType: 'SELECT', defaultRequired: true },
          ]},
          { code: 'COMPANY_FINANCIAL', name: 'Financial', fields: [
            { code: 'COMPANY_CURRENCY', name: 'Default Currency', dataType: 'SELECT', defaultRequired: true },
            { code: 'COMPANY_BANK_NAME', name: 'Bank Name', dataType: 'TEXT' },
            { code: 'COMPANY_ACCOUNT_NO', name: 'Account Number', dataType: 'TEXT', isPii: true, defaultMaskPattern: 'MASK_LAST_4' },
            { code: 'COMPANY_IFSC', name: 'IFSC Code', dataType: 'TEXT' },
          ]},
        ],
        buttons: [
          { code: 'BTN_COMPANY_SAVE', name: 'Save', variant: 'primary' },
          { code: 'BTN_COMPANY_UPLOAD_LOGO', name: 'Upload Logo', variant: 'default' },
        ],
      }],
      actions: [
        { code: 'COMPANY.VIEW', name: 'View Company Profile' },
        { code: 'COMPANY.EDIT', name: 'Edit Company Profile' },
      ],
      bulkActions: [], transitions: [], scopes: [], listColumns: [], listFilters: [],
    },

    // 2. CUSTOMERS
    { code: 'CUSTOMERS', name: 'Customers', icon: 'users', sortOrder: 2,
      forms: [{ code: 'CUSTOMER_FORM', name: 'Customer',
        sections: [
          { code: 'CUSTOMER_BASIC', name: 'Basic', fields: [
            { code: 'CUSTOMER_NAME', name: 'Name', dataType: 'TEXT', defaultRequired: true },
            { code: 'CUSTOMER_TYPE', name: 'Type', dataType: 'RADIO', defaultRequired: true },
          ]},
          { code: 'CUSTOMER_CONTACT', name: 'Contact', fields: [
            { code: 'CUSTOMER_EMAIL', name: 'Email', dataType: 'EMAIL', defaultRequired: true, isPii: true, defaultMaskPattern: 'MASK_MIDDLE' },
            { code: 'CUSTOMER_PHONE', name: 'Phone', dataType: 'PHONE', defaultRequired: true, isPii: true, defaultMaskPattern: 'MASK_LAST_4' },
          ]},
          { code: 'CUSTOMER_TAX', name: 'Tax', fields: [
            { code: 'CUSTOMER_GSTIN', name: 'GSTIN', dataType: 'TEXT', isPii: true, defaultMaskPattern: 'MASK_LAST_4' },
          ]},
          { code: 'CUSTOMER_ADDRESS', name: 'Address', fields: [
            { code: 'CUSTOMER_BILLING_ADDRESS', name: 'Billing Address', dataType: 'TEXTAREA', defaultRequired: true },
            { code: 'CUSTOMER_SHIPPING_ADDRESS', name: 'Shipping Address', dataType: 'TEXTAREA' },
            { code: 'CUSTOMER_CITY', name: 'City', dataType: 'TEXT', defaultRequired: true },
            { code: 'CUSTOMER_STATE', name: 'State', dataType: 'SELECT', defaultRequired: true },
            { code: 'CUSTOMER_PINCODE', name: 'Pincode', dataType: 'TEXT', defaultRequired: true },
          ]},
          { code: 'CUSTOMER_META', name: 'Meta', fields: [
            { code: 'CUSTOMER_NOTES', name: 'Notes', dataType: 'TEXTAREA' },
          ]},
        ],
        buttons: [
          { code: 'BTN_CUSTOMER_SAVE', name: 'Save', variant: 'primary' },
          { code: 'BTN_CUSTOMER_CANCEL', name: 'Cancel', variant: 'default' },
          { code: 'BTN_CUSTOMER_DELETE', name: 'Delete', variant: 'destructive' },
        ],
      }],
      actions: [
        { code: 'CUSTOMER.LIST', name: 'List Customers' },
        { code: 'CUSTOMER.VIEW', name: 'View Customer' },
        { code: 'CUSTOMER.CREATE', name: 'Create Customer' },
        { code: 'CUSTOMER.EDIT', name: 'Edit Customer' },
        { code: 'CUSTOMER.DELETE', name: 'Delete Customer', isHighRisk: true },
      ],
      bulkActions: [
        { code: 'CUSTOMER.BULK_DELETE', name: 'Bulk Delete', isHighRisk: true },
        { code: 'CUSTOMER.BULK_EXPORT', name: 'Bulk Export' },
      ],
      transitions: [],
      scopes: [{ code: 'DEFAULT', name: 'Customers', ownerField: 'createdById', teamField: 'teamId', branchField: 'branchId', departmentField: 'departmentId' }],
      listColumns: [
        { code: 'COL_CUSTOMER_NAME', name: 'Name', fieldCode: 'CUSTOMER_NAME', sortOrder: 1 },
        { code: 'COL_CUSTOMER_TYPE', name: 'Type', fieldCode: 'CUSTOMER_TYPE', sortOrder: 2 },
        { code: 'COL_CUSTOMER_EMAIL', name: 'Email', fieldCode: 'CUSTOMER_EMAIL', defaultMaskPattern: 'MASK_MIDDLE', sortOrder: 3 },
        { code: 'COL_CUSTOMER_PHONE', name: 'Phone', fieldCode: 'CUSTOMER_PHONE', defaultMaskPattern: 'MASK_LAST_4', sortOrder: 4 },
        { code: 'COL_CUSTOMER_GSTIN', name: 'GSTIN', fieldCode: 'CUSTOMER_GSTIN', defaultMaskPattern: 'MASK_LAST_4', sortOrder: 5 },
        { code: 'COL_CUSTOMER_CITY', name: 'City', fieldCode: 'CUSTOMER_CITY', sortOrder: 6 },
        { code: 'COL_CUSTOMER_CREATED', name: 'Created', sortOrder: 7 },
      ],
      listFilters: [
        { code: 'FILTER_CUSTOMER_TYPE', name: 'Customer Type', sortOrder: 1 },
        { code: 'FILTER_CUSTOMER_STATE', name: 'State', sortOrder: 2 },
        { code: 'FILTER_CUSTOMER_CITY', name: 'City', sortOrder: 3 },
        { code: 'FILTER_CUSTOMER_ACTIVE', name: 'Active Status', sortOrder: 4 },
      ],
    },

    // 3. PRODUCTS
    { code: 'PRODUCTS', name: 'Product Catalog', icon: 'package', sortOrder: 3,
      forms: [{ code: 'PRODUCT_FORM', name: 'Product',
        sections: [
          { code: 'PRODUCT_BASIC', name: 'Basic', fields: [
            { code: 'PRODUCT_NAME', name: 'Item Name', dataType: 'TEXT', defaultRequired: true },
            { code: 'PRODUCT_TYPE', name: 'Item Type', dataType: 'RADIO', defaultRequired: true },
            { code: 'PRODUCT_SKU', name: 'SKU', dataType: 'TEXT' },
            { code: 'PRODUCT_DESCRIPTION', name: 'Description', dataType: 'TEXTAREA' },
            { code: 'PRODUCT_HSN_SAC', name: 'HSN/SAC', dataType: 'TEXT' },
          ]},
          { code: 'PRODUCT_PRICING', name: 'Pricing', fields: [
            { code: 'PRODUCT_UNIT', name: 'Unit', dataType: 'SELECT', defaultRequired: true },
            { code: 'PRODUCT_PRICE', name: 'Selling Price', dataType: 'CURRENCY', defaultRequired: true },
          ]},
          { code: 'PRODUCT_TAX', name: 'Tax', fields: [
            { code: 'PRODUCT_TAX_RATE', name: 'Tax Rate (%)', dataType: 'SELECT', defaultRequired: true },
          ]},
          { code: 'PRODUCT_META', name: 'Categorisation', fields: [
            { code: 'PRODUCT_CATEGORY', name: 'Category', dataType: 'TEXT' },
          ]},
        ],
        buttons: [
          { code: 'BTN_PRODUCT_SAVE', name: 'Save', variant: 'primary' },
          { code: 'BTN_PRODUCT_CANCEL', name: 'Cancel', variant: 'default' },
          { code: 'BTN_PRODUCT_DELETE', name: 'Delete', variant: 'destructive' },
        ],
      }],
      actions: [
        { code: 'PRODUCT.LIST', name: 'List Products' },
        { code: 'PRODUCT.VIEW', name: 'View Product' },
        { code: 'PRODUCT.CREATE', name: 'Create Product' },
        { code: 'PRODUCT.EDIT', name: 'Edit Product' },
        { code: 'PRODUCT.DELETE', name: 'Delete Product', isHighRisk: true },
      ],
      bulkActions: [
        { code: 'PRODUCT.BULK_DELETE', name: 'Bulk Delete', isHighRisk: true },
        { code: 'PRODUCT.BULK_IMPORT', name: 'Bulk Import from CSV' },
        { code: 'PRODUCT.BULK_EXPORT', name: 'Bulk Export' },
      ],
      transitions: [],
      scopes: [{ code: 'DEFAULT', name: 'Products', ownerField: 'createdById' }],
      listColumns: [
        { code: 'COL_PRODUCT_NAME', name: 'Item Name', fieldCode: 'PRODUCT_NAME', sortOrder: 1 },
        { code: 'COL_PRODUCT_TYPE', name: 'Type', fieldCode: 'PRODUCT_TYPE', sortOrder: 2 },
        { code: 'COL_PRODUCT_SKU', name: 'SKU', fieldCode: 'PRODUCT_SKU', sortOrder: 3 },
        { code: 'COL_PRODUCT_UNIT', name: 'Unit', fieldCode: 'PRODUCT_UNIT', sortOrder: 4 },
        { code: 'COL_PRODUCT_PRICE', name: 'Price', fieldCode: 'PRODUCT_PRICE', sortOrder: 5 },
        { code: 'COL_PRODUCT_TAX', name: 'Tax %', fieldCode: 'PRODUCT_TAX_RATE', sortOrder: 6 },
      ],
      listFilters: [
        { code: 'FILTER_PRODUCT_TYPE', name: 'Type', sortOrder: 1 },
        { code: 'FILTER_PRODUCT_CATEGORY', name: 'Category', sortOrder: 2 },
        { code: 'FILTER_PRODUCT_ACTIVE', name: 'Active Status', sortOrder: 3 },
        { code: 'FILTER_PRODUCT_TAX_RATE', name: 'Tax Rate', sortOrder: 4 },
      ],
    },

    // 4. INVOICES — full form with 5 sections + status transitions + bulk + scope
    { code: 'INVOICES', name: 'Invoices', icon: 'file-text', sortOrder: 4,
      forms: [{ code: 'INVOICE_FORM', name: 'Invoice',
        sections: [
          { code: 'INVOICE_HEADER', name: 'Invoice Header', fields: [
            { code: 'INVOICE_NUMBER', name: 'Invoice Number', dataType: 'TEXT', defaultRequired: true },
            { code: 'INVOICE_DATE', name: 'Invoice Date', dataType: 'DATE', defaultRequired: true },
            { code: 'INVOICE_DUE_DATE', name: 'Due Date', dataType: 'DATE', defaultRequired: true },
            { code: 'INVOICE_REFERENCE', name: 'Reference / PO Number', dataType: 'TEXT' },
            { code: 'INVOICE_PAYMENT_TERMS', name: 'Payment Terms', dataType: 'SELECT', defaultRequired: true },
          ]},
          { code: 'INVOICE_CUSTOMER', name: 'Customer Selection', fields: [
            { code: 'INVOICE_CUSTOMER_ID', name: 'Customer', dataType: 'SELECT', defaultRequired: true },
            { code: 'INVOICE_BILLING_ADDRESS', name: 'Billing Address', dataType: 'TEXTAREA' },
            { code: 'INVOICE_SHIPPING_ADDRESS', name: 'Shipping Address', dataType: 'TEXTAREA' },
          ]},
          { code: 'INVOICE_LINE_ITEMS', name: 'Line Items', fields: [
            { code: 'LINE_ITEM_PRODUCT', name: 'Item', dataType: 'SELECT', defaultRequired: true },
            { code: 'LINE_ITEM_DESCRIPTION', name: 'Description', dataType: 'TEXT' },
            { code: 'LINE_ITEM_HSN', name: 'HSN/SAC', dataType: 'TEXT' },
            { code: 'LINE_ITEM_QTY', name: 'Quantity', dataType: 'NUMBER', defaultRequired: true },
            { code: 'LINE_ITEM_UNIT', name: 'Unit', dataType: 'TEXT' },
            { code: 'LINE_ITEM_RATE', name: 'Rate', dataType: 'CURRENCY', defaultRequired: true },
            { code: 'LINE_ITEM_DISCOUNT_PCT', name: 'Discount %', dataType: 'NUMBER' },
            { code: 'LINE_ITEM_TAX_PCT', name: 'Tax %', dataType: 'SELECT', defaultRequired: true },
            { code: 'LINE_ITEM_AMOUNT', name: 'Amount', dataType: 'CURRENCY' },
          ]},
          { code: 'INVOICE_TOTALS', name: 'Totals & Summary', fields: [
            { code: 'INVOICE_SUBTOTAL', name: 'Subtotal', dataType: 'CURRENCY' },
            { code: 'INVOICE_TOTAL_DISCOUNT', name: 'Total Discount', dataType: 'CURRENCY' },
            { code: 'INVOICE_TAXABLE', name: 'Taxable Amount', dataType: 'CURRENCY' },
            { code: 'INVOICE_CGST', name: 'CGST', dataType: 'CURRENCY' },
            { code: 'INVOICE_SGST', name: 'SGST', dataType: 'CURRENCY' },
            { code: 'INVOICE_IGST', name: 'IGST', dataType: 'CURRENCY' },
            { code: 'INVOICE_SHIPPING', name: 'Shipping Charges', dataType: 'CURRENCY' },
            { code: 'INVOICE_ROUND_OFF', name: 'Round Off', dataType: 'CURRENCY' },
            { code: 'INVOICE_GRAND_TOTAL', name: 'Grand Total', dataType: 'CURRENCY' },
            { code: 'INVOICE_AMOUNT_IN_WORDS', name: 'Amount in Words', dataType: 'TEXT' },
          ]},
          { code: 'INVOICE_FOOTER', name: 'Footer', fields: [
            { code: 'INVOICE_NOTES', name: 'Notes to Customer', dataType: 'TEXTAREA' },
            { code: 'INVOICE_TERMS', name: 'Terms & Conditions', dataType: 'TEXTAREA' },
            { code: 'INVOICE_STATUS', name: 'Status', dataType: 'SELECT' },
            { code: 'INVOICE_ATTACHMENT', name: 'Attachment', dataType: 'FILE' },
          ]},
        ],
        buttons: [
          { code: 'BTN_INVOICE_SAVE_DRAFT', name: 'Save as Draft', variant: 'default' },
          { code: 'BTN_INVOICE_SAVE_PREVIEW', name: 'Save & Preview', variant: 'primary' },
          { code: 'BTN_INVOICE_CANCEL', name: 'Cancel', variant: 'default' },
          { code: 'BTN_INVOICE_ADD_LINE', name: 'Add Line Item', variant: 'default' },
          { code: 'BTN_INVOICE_DELETE_LINE', name: 'Delete Line', variant: 'destructive' },
          { code: 'BTN_INVOICE_DOWNLOAD_PDF', name: 'Download PDF', variant: 'default' },
          { code: 'BTN_INVOICE_PRINT', name: 'Print', variant: 'default' },
          { code: 'BTN_INVOICE_GENERATE_PAYMENT_LINK', name: 'Generate Razorpay Payment Link', variant: 'primary' },
        ],
      }],
      actions: [
        { code: 'INVOICE.LIST', name: 'List Invoices' },
        { code: 'INVOICE.VIEW', name: 'View Invoice' },
        { code: 'INVOICE.CREATE', name: 'Create Invoice' },
        { code: 'INVOICE.EDIT', name: 'Edit Invoice' },
        { code: 'INVOICE.DELETE', name: 'Delete Invoice', isHighRisk: true },
        { code: 'INVOICE.DUPLICATE', name: 'Duplicate Invoice' },
        { code: 'INVOICE.DOWNLOAD_PDF', name: 'Download PDF' },
        { code: 'INVOICE.PRINT', name: 'Print Invoice' },
      ],
      bulkActions: [
        { code: 'INVOICE.BULK_SEND', name: 'Bulk Send', isHighRisk: true },
        { code: 'INVOICE.BULK_MARK_PAID', name: 'Bulk Mark as Paid', isHighRisk: true },
        { code: 'INVOICE.BULK_EXPORT', name: 'Bulk Export' },
        { code: 'INVOICE.BULK_DELETE', name: 'Bulk Delete', isHighRisk: true },
      ],
      transitions: [
        { code: 'INVOICE.DRAFT_TO_SENT', name: 'Send Invoice', fromStatus: 'DRAFT', toStatus: 'SENT' },
        { code: 'INVOICE.DRAFT_TO_CANCELLED', name: 'Discard Draft', fromStatus: 'DRAFT', toStatus: 'CANCELLED' },
        { code: 'INVOICE.SENT_TO_PAID', name: 'Mark as Paid', fromStatus: 'SENT', toStatus: 'PAID' },
        { code: 'INVOICE.SENT_TO_CANCELLED', name: 'Cancel Sent Invoice', fromStatus: 'SENT', toStatus: 'CANCELLED' },
        { code: 'INVOICE.PAID_TO_CANCELLED', name: 'Reverse Paid Invoice', fromStatus: 'PAID', toStatus: 'CANCELLED' },
        { code: 'INVOICE.SENT_TO_PARTIALLY_PAID', name: 'Mark Partially Paid', fromStatus: 'SENT', toStatus: 'PARTIALLY_PAID' },
        { code: 'INVOICE.PARTIALLY_PAID_TO_PAID', name: 'Complete Payment', fromStatus: 'PARTIALLY_PAID', toStatus: 'PAID' },
      ],
      scopes: [{ code: 'DEFAULT', name: 'Invoices', ownerField: 'createdById', teamField: 'teamId', branchField: 'branchId', departmentField: 'departmentId' }],
      listColumns: [
        { code: 'COL_INVOICE_NUMBER', name: 'Invoice #', fieldCode: 'INVOICE_NUMBER', sortOrder: 1 },
        { code: 'COL_INVOICE_DATE', name: 'Date', fieldCode: 'INVOICE_DATE', sortOrder: 2 },
        { code: 'COL_INVOICE_CUSTOMER', name: 'Customer', sortOrder: 3 },
        { code: 'COL_INVOICE_DUE', name: 'Due Date', fieldCode: 'INVOICE_DUE_DATE', sortOrder: 4 },
        { code: 'COL_INVOICE_AMOUNT', name: 'Amount', fieldCode: 'INVOICE_GRAND_TOTAL', sortOrder: 5 },
        { code: 'COL_INVOICE_STATUS', name: 'Status', fieldCode: 'INVOICE_STATUS', sortOrder: 6 },
        { code: 'COL_INVOICE_CREATED_BY', name: 'Created By', sortOrder: 7 },
      ],
      listFilters: [
        { code: 'FILTER_INVOICE_STATUS', name: 'Status', sortOrder: 1 },
        { code: 'FILTER_INVOICE_DATE_RANGE', name: 'Date Range', sortOrder: 2 },
        { code: 'FILTER_INVOICE_CUSTOMER', name: 'Customer', sortOrder: 3 },
        { code: 'FILTER_INVOICE_CREATED_BY', name: 'Created By', sortOrder: 4 },
        { code: 'FILTER_INVOICE_AMOUNT_RANGE', name: 'Amount Range', sortOrder: 5 },
        { code: 'FILTER_INVOICE_PAYMENT_TERMS', name: 'Payment Terms', sortOrder: 6 },
      ],
    },

    // 5. PAYMENTS — NEW Razorpay module
    { code: 'PAYMENTS', name: 'Payments', icon: 'credit-card', sortOrder: 5,
      forms: [],
      actions: [
        { code: 'PAYMENT.LIST', name: 'List Payments' },
        { code: 'PAYMENT.VIEW', name: 'View Payment Details' },
        { code: 'PAYMENT.REFUND', name: 'Initiate Refund', isHighRisk: true },
        { code: 'PAYMENT_LINK.CREATE', name: 'Generate Razorpay Payment Link' },
        { code: 'PAYMENT_LINK.CANCEL', name: 'Cancel Payment Link' },
      ],
      bulkActions: [
        { code: 'PAYMENT.BULK_EXPORT', name: 'Bulk Export Payments' },
      ],
      transitions: [],
      scopes: [{ code: 'DEFAULT', name: 'Payments', ownerField: 'createdById' }],
      listColumns: [
        { code: 'COL_PAYMENT_INVOICE', name: 'Invoice #', sortOrder: 1 },
        { code: 'COL_PAYMENT_CUSTOMER', name: 'Customer', sortOrder: 2 },
        { code: 'COL_PAYMENT_AMOUNT', name: 'Amount', sortOrder: 3 },
        { code: 'COL_PAYMENT_METHOD', name: 'Method', sortOrder: 4 },
        { code: 'COL_PAYMENT_STATUS', name: 'Status', sortOrder: 5 },
        { code: 'COL_PAYMENT_CAPTURED_AT', name: 'Captured At', sortOrder: 6 },
        { code: 'COL_PAYMENT_RAZORPAY_ID', name: 'Razorpay Payment ID', defaultMaskPattern: 'MASK_LAST_4', sortOrder: 7 },
      ],
      listFilters: [
        { code: 'FILTER_PAYMENT_STATUS', name: 'Status', sortOrder: 1 },
        { code: 'FILTER_PAYMENT_DATE_RANGE', name: 'Date Range', sortOrder: 2 },
        { code: 'FILTER_PAYMENT_METHOD', name: 'Method', sortOrder: 3 },
        { code: 'FILTER_PAYMENT_INVOICE', name: 'Invoice', sortOrder: 4 },
      ],
    },

    // 6. PRIVILEGE_MGMT
    { code: 'PRIVILEGE_MGMT', name: 'Privilege Management', icon: 'shield', sortOrder: 90,
      forms: [],
      actions: [
        { code: 'PRIVILEGE.MANAGE', name: 'Manage Roles & Permissions' },
        { code: 'PRIVILEGE.AUDIT_VIEW', name: 'View Audit Log' },
        { code: 'PRIVILEGE.PREVIEW_AS_USER', name: 'Preview as Another User' },
        { code: 'PRIVILEGE.TEMPLATE_MANAGE', name: 'Manage Templates' },
        { code: 'PRIVILEGE.APPROVAL_HANDLE', name: 'Approve / Reject Requests' },
      ],
      bulkActions: [], transitions: [], scopes: [], listColumns: [], listFilters: [],
    },

    // 7. USER_MGMT
    { code: 'USER_MGMT', name: 'User Management', icon: 'user-cog', sortOrder: 91,
      forms: [{ code: 'USER_FORM', name: 'User',
        sections: [
          { code: 'USER_BASIC', name: 'Basic', fields: [
            { code: 'USER_FULL_NAME', name: 'Full Name', dataType: 'TEXT', defaultRequired: true },
            { code: 'USER_EMAIL', name: 'Email', dataType: 'EMAIL', defaultRequired: true, isPii: true },
            { code: 'USER_PASSWORD', name: 'Password', dataType: 'TEXT', defaultRequired: true },
            { code: 'USER_ACTIVE', name: 'Active', dataType: 'TEXT' },
          ]},
          { code: 'USER_ORG', name: 'Organisation', fields: [
            { code: 'USER_TEAM', name: 'Team', dataType: 'SELECT' },
            { code: 'USER_BRANCH', name: 'Branch', dataType: 'SELECT' },
            { code: 'USER_DEPARTMENT', name: 'Department', dataType: 'SELECT' },
            { code: 'USER_MANAGER', name: 'Manager', dataType: 'SELECT' },
          ]},
        ],
        buttons: [
          { code: 'BTN_USER_SAVE', name: 'Save', variant: 'primary' },
          { code: 'BTN_USER_DEACTIVATE', name: 'Deactivate', variant: 'destructive' },
          { code: 'BTN_USER_RESET_PASSWORD', name: 'Reset Password', variant: 'default' },
        ],
      }],
      actions: [
        { code: 'USER.LIST', name: 'List Users' },
        { code: 'USER.CREATE', name: 'Create User' },
        { code: 'USER.EDIT', name: 'Edit User' },
        { code: 'USER.DEACTIVATE', name: 'Deactivate User', isHighRisk: true },
        { code: 'USER.RESET_PASSWORD', name: 'Reset User Password' },
      ],
      bulkActions: [], transitions: [], scopes: [], listColumns: [], listFilters: [],
    },
  ],

  // ----- REPORTS -----
  reports: [
    { code: 'RPT_INVOICE_AGING', name: 'Invoice Aging Report', category: 'Finance' },
    { code: 'RPT_REVENUE_SUMMARY', name: 'Revenue Summary', category: 'Finance' },
    { code: 'RPT_TAX_LIABILITY', name: 'Tax Liability Report', category: 'Finance' },
    { code: 'RPT_PAYMENT_COLLECTION', name: 'Razorpay Collection Report', category: 'Finance' },
    { code: 'RPT_CUSTOMER_LIFETIME', name: 'Customer Lifetime Value', category: 'CRM' },
    { code: 'RPT_TOP_CUSTOMERS', name: 'Top Customers by Revenue', category: 'CRM' },
    { code: 'RPT_TOP_PRODUCTS', name: 'Top Selling Products', category: 'Sales' },
    { code: 'RPT_INVOICE_STATUS', name: 'Invoice Status Distribution', category: 'Operations' },
    { code: 'RPT_USER_ACTIVITY', name: 'User Activity Report', category: 'Admin' },
  ],

  // ----- DASHBOARD WIDGETS -----
  dashboardWidgets: [
    { code: 'WIDGET_REVENUE_MTD', name: 'Revenue (Month to Date)' },
    { code: 'WIDGET_REVENUE_YTD', name: 'Revenue (Year to Date)' },
    { code: 'WIDGET_OUTSTANDING', name: 'Outstanding Receivables' },
    { code: 'WIDGET_OVERDUE_COUNT', name: 'Overdue Invoice Count' },
    { code: 'WIDGET_TOP_CUSTOMERS', name: 'Top 5 Customers' },
    { code: 'WIDGET_RECENT_INVOICES', name: 'Recent Invoices' },
    { code: 'WIDGET_RECENT_PAYMENTS', name: 'Recent Razorpay Payments' },
    { code: 'WIDGET_INVOICES_BY_STATUS', name: 'Invoices by Status (chart)' },
    { code: 'WIDGET_REVENUE_TREND', name: 'Revenue Trend (12-month)' },
    { code: 'WIDGET_TAX_COLLECTED_MTD', name: 'Tax Collected (MTD)' },
    { code: 'WIDGET_PENDING_APPROVALS', name: 'My Pending Approvals' },
  ],
};
```

## B.10 Default Role Grants (seed)

| Role | Invoices | Customers | Products | Payments | Reports | Notable |
|---|---|---|---|---|---|---|
| `SUPER_ADMIN` | All EDIT | All EDIT | All EDIT | All EDIT | All EXPORT | Bypasses everything |
| `ADMIN` | All EDIT, all actions ALLOW | All EDIT | All EDIT | All EDIT incl. refund | All EXPORT | Includes `PRIVILEGE.MANAGE` |
| `ACCOUNTANT` | EDIT; `PAID_TO_CANCELLED` `ALLOW_WITH_APPROVAL`; no BULK_DELETE | EDIT | EDIT | EDIT incl. `PAYMENT.REFUND` `ALLOW_WITH_APPROVAL` | All EXPORT | Cannot manage privileges or users |
| `SALES` | EDIT, RECORD_SCOPE = TEAM; cannot DELETE; cannot PAID_TO_CANCELLED | EDIT (TEAM scope) | VIEW | VIEW only | RPT_TOP_CUSTOMERS, RPT_TOP_PRODUCTS only | No bulk delete/send |
| `VIEWER` | All VIEW; destructive DENY; PII columns MASKED | VIEW (MASKED PII) | VIEW | VIEW (MASKED Razorpay IDs) | All VIEW (no EXPORT) | Read-only |
| `AUDITOR` | All VIEW; `AUDIT_VIEW` ALLOW | VIEW unmasked | VIEW | VIEW unmasked | All EXPORT | Read-only + audit access |

## B.11 Seed Data Requirements

- **1 company profile** (Accordex Systems Pvt Ltd, Bangalore, Karnataka)
- **6 users** with bcrypt-hashed passwords: 1 SUPER_ADMIN, 1 ADMIN, 1 ACCOUNTANT, 1 SALES (with team), 1 VIEWER, 1 AUDITOR
- **2 teams, 2 branches, 2 departments**
- **3 customers** (1 Individual; 1 Business intra-state Karnataka; 1 Business inter-state Tamil Nadu)
- **5 products** (mix Product/Service; tax rates 0/5/12/18/28)
- **5 invoices** (1 Draft, 2 Sent, 1 Paid, 1 Cancelled; one intra-state CGST/SGST split, one inter-state IGST)
- **2 sample payment links** (1 Created, 1 Paid)
- **1 sample Razorpay Payment** (CAPTURED, linked to the Paid invoice)
- **3 privilege templates:** "Front Desk Receptionist", "Read-Only Auditor", "Finance Approver"
- **2 sample approval requests** (1 pending PAID_TO_CANCELLED, 1 approved PAYMENT.REFUND)

## B.12 README Requirements

`/README.md` covering:
1. Project description
2. Tech stack (Next.js 14, NextAuth, pg-boss, Razorpay)
3. Folder structure (tree of `/app`, `/components`, `/lib`, `/prisma`)
4. Prerequisites (Node 20+, pnpm, PostgreSQL 16, Razorpay test account)
5. `.env.example` keys + how to get them
6. Setup: clone → `pnpm install` → `cp .env.example .env` → `pnpm prisma migrate dev` → `pnpm prisma db seed` → `pnpm dev` (terminal 1) → `pnpm worker` (terminal 2)
7. Razorpay test setup: how to register webhook URL via ngrok in dev (`http://localhost:3000/api/razorpay/webhook`)
8. Default login credentials (table of 6 seed users with role + password)
9. **Privilege System Overview** — 1-page summary of 15-level architecture with screenshot of Role Editor matrix
10. **How Record Scope Works** — example of SALES user seeing only their team's invoices
11. **How Approval Flow Works** — example of ACCOUNTANT reversing a paid invoice → goes to ADMIN queue
12. **How to Add a New Permission** — copy/paste guide for extending the registry manifest
13. **Razorpay Integration Notes** — webhook verification, idempotency, status mapping table
14. Completed feature checklist
15. Deployment notes (Vercel for app + Neon/Supabase for Postgres + separate worker process on Railway/Fly.io)

## B.13 Acceptance Checklist

**Functionality**
- [ ] All 6 invoice modules implemented end-to-end (Company, Customers, Products, Invoices, Payments, Reports)
- [ ] Live calculations correct for all edge cases (zero, decimals, large numbers)
- [ ] GST split toggles intra/inter-state by comparing customer/company state
- [ ] Invoice PDF matches preview pixel-for-pixel; A4; logo embedded
- [ ] Indian number formatting (`1,00,000.00`) for INR
- [ ] Amount in words generates correctly up to 99,99,99,999.99

**Razorpay**
- [ ] Payment link generation from an invoice works end-to-end
- [ ] Webhook signature verification correctly rejects tampered requests
- [ ] Duplicate webhook events are idempotent (no double-paid invoices)
- [ ] `payment_link.paid` event transitions invoice to PAID automatically
- [ ] Reconciliation job catches missed webhooks within 2 hours
- [ ] Refund flow correctly creates a Payment row with REFUNDED status

**Privilege Engine**
- [ ] All 15 target levels modelled and seeded for Invoice product
- [ ] Field masking applied server-side AND client-side for PII fields
- [ ] Record scope correctly filters list queries (Prisma WHERE clause)
- [ ] Status transitions correctly gated (e.g., SALES can DRAFT_TO_SENT but not PAID_TO_CANCELLED)
- [ ] Bulk actions separate from individual actions
- [ ] `ALLOW_WITH_APPROVAL` correctly queues to ApprovalRequest table
- [ ] Time-bound grants expire and revert at correct time via pg-boss cron
- [ ] Condition expressions evaluate correctly

**NextAuth & Sessions**
- [ ] Login with credentials provider works
- [ ] Session contains userId, isSuperAdmin, teamId, branchId, departmentId
- [ ] `middleware.ts` correctly redirects unauthenticated users to /login
- [ ] `/api/razorpay/webhook` is exempt from auth middleware

**pg-boss**
- [ ] Worker process starts and listens for jobs
- [ ] `privilege:recompute` triggered on grant changes; EffectivePrivilege rebuilt
- [ ] Cron schedules registered correctly (`*/5 * * * *`, etc.)
- [ ] Failed jobs retry with exponential backoff

**Admin UI**
- [ ] All 10 admin screens implemented
- [ ] Role Editor's 15 tabs all functional with bulk "set all to X"
- [ ] Preview-as-user shows banner, blocks writes, logs to audit
- [ ] Role comparison color-coded diff works
- [ ] Privilege templates apply with all 3 conflict strategies
- [ ] Approval queue notifies approvers
- [ ] Audit log is filterable, exportable, immutable

**Integration**
- [ ] Every API write route guarded via `withPrivilege`
- [ ] Every UI field wrapped in `<PrivilegeField>`
- [ ] Every list column respects `LIST_COLUMN` mode + mask
- [ ] No console errors
- [ ] Lighthouse a11y ≥ 90

---

## Implementation Order (for Cursor)

1. **Scaffold Next.js 14 app** — `pnpm create next-app@latest --typescript --tailwind --app`
2. **Install dependencies:** `prisma`, `@prisma/client`, `next-auth`, `@auth/prisma-adapter`, `bcryptjs`, `pg-boss`, `razorpay`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@react-pdf/renderer`, shadcn/ui
3. **Prisma schema** — Part A.3 + Part B.2 → `pnpm prisma migrate dev`
4. **NextAuth setup** — Part A.4 (auth.ts, middleware.ts, route handler)
5. **Privilege engine** — resolver, withPrivilege wrapper, scope helper, scrub helper (Part A.5–A.6)
6. **pg-boss worker** — queue setup + handlers (Part A.12)
7. **Seed registry** from `manifest.ts` (Part B.9) + system roles + 6 users + org units
8. **Build privilege React hooks + components** (Part A.7)
9. **Build Admin UI** — all 10 screens (Part A.8)
10. **Build Company Profile module**
11. **Build Customer module** (with `<PrivilegeField>`, `<PrivilegeColumn>`, `<PrivilegeButton>`)
12. **Build Product Catalog module**
13. **Build Invoice Creation module** — heaviest; leave 2 days
14. **Build Invoice Listing module** with record scope + filters
15. **Build Invoice Preview + PDF module** (`@react-pdf/renderer`)
16. **Razorpay integration** — client, payment link creation, webhook handler, reconcile job (Part B.7)
17. **Build Payments module + Dashboard + Reports**
18. **Seed sample customers, products, invoices, payments, templates, approvals** (Part B.11)
19. **Write README + verify acceptance checklist**

---

**END OF PROMPT.**
