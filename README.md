# Invoice Generator

A multi-tenant-ready invoice management application built for Indian GST compliance. Create and send invoices, manage customers and products, collect payments via Razorpay, and enforce fine-grained role-based privileges across every UI element and API action.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Auth | NextAuth v5 (Credentials provider) |
| Database | PostgreSQL 16 + Prisma ORM |
| Background jobs | pg-boss (same Postgres instance) |
| Payments | Razorpay (payment links + webhooks) |
| UI | React 18, Tailwind CSS, shadcn/ui, TanStack Query & Table |
| PDF | @react-pdf/renderer |
| Validation | Zod + react-hook-form |
| Tests | Vitest |

## Folder Structure

```
/app
  /api
    /auth/[...nextauth]     # NextAuth route handler
    /company                # Company profile API
    /customers              # Customer CRUD + bulk ops
    /dashboard/widgets      # Dashboard widget data
    /invoices               # Invoice CRUD, transitions, payment links
    /me                     # Current user privileges & approval requests
    /payments               # Payment listing
    /products               # Product catalog CRUD + bulk ops
    /razorpay/webhook       # Razorpay webhook receiver (no auth)
    /reports/[code]         # Report data endpoints

/components                 # (planned) shadcn/ui, privilege guards, module forms
  /ui
  /privilege
  /invoices
  /customers
  /products
  /payments
  /shared

/lib
  /prisma.ts                # PrismaClient singleton
  /auth.ts                  # NextAuth configuration
  /calc.ts                  # Invoice line & GST calculations
  /privilege
    manifest.ts             # Product registry manifest (source of truth)
    registry-sync.ts        # Sync manifest → DB registry tables
    resolver.ts             # Effective privilege computation
    withPrivilege.ts        # API route guard wrapper
    scope.ts                # Record-scope Prisma WHERE builder
    scrub.ts                # Server-side PII masking
  /invoices                 # Invoice service, numbering, transitions
  /razorpay                 # SDK client, payment links, webhook handlers
  /jobs                     # pg-boss queue + worker + cron handlers
  /validation               # Zod schemas per module
  /reports                  # Report query builders
  /dashboard                # Widget data providers

/prisma
  schema.prisma             # Full schema (privilege + invoice domain)
  seed.ts                   # Registry sync, roles, users, sample data
```

## Prerequisites

- **Node.js** 20 or later
- **pnpm** (recommended package manager)
- **PostgreSQL** 16
- **Razorpay test account** ([dashboard.razorpay.com](https://dashboard.razorpay.com)) for payment link and webhook testing

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description | How to obtain |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Local Postgres or hosted (Neon, Supabase) |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3000` in dev |
| `NEXTAUTH_SECRET` | Session signing secret | `openssl rand -base64 32` |
| `RAZORPAY_KEY_ID` | Razorpay API key ID | Razorpay Dashboard → Settings → API Keys (Test mode) |
| `RAZORPAY_KEY_SECRET` | Razorpay API secret | Same page as key ID |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC secret | Razorpay Dashboard → Webhooks → create endpoint |
| `APP_BASE_URL` | Public app URL for payment link callbacks | `http://localhost:3000` in dev |

## Setup

```powershell
# 1. Clone and install
git clone <repo-url> invoice_generator
cd invoice_generator
pnpm install

# 2. Configure environment
Copy-Item .env.example .env
# Edit .env with your values

# 3. Database
pnpm prisma migrate dev
pnpm prisma db seed

# 4. Run the app (terminal 1)
pnpm dev

# 5. Run the background worker (terminal 2)
pnpm worker
```

The app runs at [http://localhost:3000](http://localhost:3000).

Run unit tests with:

```powershell
pnpm test
```

## Razorpay Test Setup

1. Enable **Test Mode** in the Razorpay Dashboard.
2. Copy **Key ID** and **Key Secret** into `.env`.
3. For local webhook delivery, expose your dev server with [ngrok](https://ngrok.com):

   ```powershell
   ngrok http 3000
   ```

4. In Razorpay Dashboard → **Webhooks**, add:

   ```
   https://<your-ngrok-subdomain>.ngrok.io/api/razorpay/webhook
   ```

5. Select events: `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`, `payment.captured`, `refund.created`.
6. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.

The webhook route is exempt from auth middleware so Razorpay can POST directly.

## Default Login Credentials

All seed users share the password **`Password@123`**.

| Email | Role | Notes |
|---|---|---|
| `superadmin@accordex.com` | Super Admin | `isSuperAdmin` bypasses all privilege checks |
| `admin@accordex.com` | Admin | Full access + privilege management |
| `accountant@accordex.com` | Accountant | Finance ops; reversals require approval |
| `sales@accordex.com` | Sales | Team-scoped; assigned to Enterprise Sales |
| `viewer@accordex.com` | Viewer | Read-only; PII columns masked |
| `auditor@accordex.com` | Auditor | Read-only unmasked + audit log + report export |

## Privilege System Overview

The privilege engine models **15 target levels**, each with its own mode ladder:

| Level | Example targets | Modes |
|---|---|---|
| MENU_ITEM | `NAV_INVOICES` | HIDDEN → VISIBLE |
| MODULE | `INVOICES` | NO_ACCESS → VIEW → EDIT |
| FORM | `INVOICE_FORM` | NO_ACCESS → VIEW → EDIT |
| TAB | (per form tab) | HIDDEN → COLLAPSED → VIEW → EDIT |
| SECTION | `INVOICE_HEADER` | HIDDEN → COLLAPSED → VIEW → EDIT |
| FIELD | `INVOICE_NUMBER` | HIDDEN → MASKED → VIEW → EDIT → REQUIRED → OPTIONAL |
| BUTTON | `BTN_INVOICE_SAVE_DRAFT` | HIDDEN → DISABLED → VISIBLE |
| LIST_COLUMN | `COL_CUSTOMER_EMAIL` | HIDDEN → MASKED → VISIBLE |
| LIST_FILTER | `FILTER_INVOICE_STATUS` | HIDDEN → VISIBLE |
| ACTION | `INVOICE.DELETE` | DENY → ALLOW_WITH_APPROVAL → ALLOW |
| BULK_ACTION | `INVOICE.BULK_DELETE` | DENY → ALLOW_WITH_APPROVAL → ALLOW |
| STATUS_TRANSITION | `INVOICE.PAID_TO_CANCELLED` | DENY → ALLOW_WITH_APPROVAL → ALLOW |
| RECORD_SCOPE | `INVOICES` | OWN → TEAM → DEPARTMENT → BRANCH → ALL |
| REPORT | `RPT_TAX_LIABILITY` | HIDDEN → VIEW → EXPORT |
| DASHBOARD_WIDGET | `WIDGET_REVENUE_MTD` | HIDDEN → VISIBLE |

**Resolution order:** role grants (merged permissively) → user overrides (replace) → cached in `EffectivePrivilege`.

The **Role Editor** exposes one tab per level with bulk "set all to X", time-bound grants, and condition expressions. *(Screenshot: open `/admin/privileges/roles` after starting the app to view the 15-tab matrix.)*

Registry definitions live in `lib/privilege/manifest.ts` and sync to the database via `syncManifestToRegistry`.

## How Record Scope Works

Record scope limits which rows a user sees in list queries. Each scoped module (Invoices, Customers, etc.) has a `RECORD_SCOPE` grant.

**Example — SALES user (`sales@accordex.com`):**

- Role grant: `RECORD_SCOPE:INVOICES = TEAM`
- User's `teamId` = Enterprise Sales
- List query adds `WHERE teamId = <user.teamId>`
- Result: Ravi sees invoices created by his team (seed invoices `INV-2025-0001`, `0002`, `0004`, `0005`) but not Chennai team's `INV-2025-0003`

Scope hierarchy: **OWN** (creator only) < **TEAM** < **DEPARTMENT** < **BRANCH** < **ALL**.

## How Approval Flow Works

Actions or transitions granted as `ALLOW_WITH_APPROVAL` queue an `ApprovalRequest` instead of executing immediately.

**Example — reversing a paid invoice:**

1. Accountant (`accountant@accordex.com`) attempts `INVOICE.PAID_TO_CANCELLED` on `INV-2025-0004`.
2. Grant mode is `ALLOW_WITH_APPROVAL` → system creates a `PENDING` approval request (seeded as `seed-approval-pending-cancel`).
3. Admin (`admin@accordex.com`) with `PRIVILEGE.APPROVAL_HANDLE = ALLOW` sees the request in the approval queue.
4. Admin approves → transition executes; invoice status becomes `CANCELLED`.
5. Admin rejects → request marked `REJECTED`; invoice stays `PAID`.

A similar flow applies to `PAYMENT.REFUND` (seed includes an approved refund request).

## How to Add a New Permission

1. **Define in manifest** — edit `lib/privilege/manifest.ts`:

   ```typescript
   // Add an action to the relevant module
   actions: [
     // ...existing
     { code: 'INVOICE.ARCHIVE', name: 'Archive Invoice', isHighRisk: true },
   ],
   ```

2. **Sync registry** — run seed or call `POST /api/privilege/registry/sync`:

   ```powershell
   pnpm prisma db seed
   ```

3. **Grant to roles** — in Role Editor or seed, add:

   ```typescript
   { targetLevel: 'ACTION', targetId: 'INVOICE.ARCHIVE', mode: 'ALLOW' }
   ```

4. **Guard the API route** — wrap the handler:

   ```typescript
   export const POST = withPrivilege(
     { action: 'INVOICE.ARCHIVE' },
     async (req) => { /* handler */ },
   );
   ```

5. **Guard the UI** — wrap the button:

   ```tsx
   <PrivilegeButton action="INVOICE.ARCHIVE">Archive</PrivilegeButton>
   ```

6. **Recompute privileges** — pg-boss enqueues `privilege:recompute` automatically on grant changes.

## Razorpay Integration Notes

### Webhook verification

Every inbound webhook is verified with HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`. Tampered or unsigned payloads are rejected with HTTP 400.

### Idempotency

- `RazorpayWebhookEvent.razorpayEventId` is unique — duplicate events are ignored.
- Payment upserts use `razorpayPaymentId` as a unique key — retries cannot double-credit.

### Status mapping

| Razorpay event | PaymentLink status | Invoice transition |
|---|---|---|
| `payment_link.paid` | `PAID` | `SENT` → `PAID` (if applicable) |
| `payment_link.cancelled` | `CANCELLED` | — |
| `payment_link.expired` | `EXPIRED` | — |
| `payment.captured` | — | Creates/updates `Payment` row (`CAPTURED`) |
| `refund.created` | — | Creates `Payment` row (`REFUNDED`) |

A reconciliation cron (`razorpay:reconcile`, every 2 hours) catches missed webhooks.

## Completed Feature Checklist

- [x] Prisma schema (privilege registry + invoice domain)
- [x] Product manifest with 15-level registry definitions
- [x] Registry sync (`syncManifestToRegistry`)
- [x] Privilege resolver with effective privilege cache
- [x] System roles with B.10 default grants
- [x] Seed data (company, users, org units, customers, products, invoices, payments)
- [x] Invoice calculations (GST split, amount in words, Indian formatting)
- [x] API routes for company, customers, products, invoices, payments, reports
- [x] Razorpay webhook handler with signature verification
- [x] pg-boss worker with privilege recompute and cron jobs
- [x] NextAuth credentials authentication
- [ ] Full UI pages (dashboard, invoice forms, admin screens)
- [ ] Invoice PDF generation
- [ ] Privilege React components (`PrivilegeField`, `Guarded`, etc.)
- [ ] End-to-end Razorpay payment link creation from UI

## Deployment Notes

| Component | Recommended platform |
|---|---|
| Next.js app | **Vercel** (or any Node 20+ host) |
| PostgreSQL | **Neon** or **Supabase** (managed Postgres 16) |
| pg-boss worker | **Railway** or **Fly.io** (separate long-running process) |

**Production checklist:**

1. Set all env vars in the hosting dashboard (never commit `.env`).
2. Run `pnpm prisma migrate deploy` against the production database.
3. Run `pnpm prisma db seed` once (or use `POST /api/privilege/registry/sync` for registry only).
4. Deploy the worker as a separate service using `pnpm worker` — it shares `DATABASE_URL` with the app.
5. Register the production webhook URL in Razorpay: `https://<your-domain>/api/razorpay/webhook`.
6. Use Razorpay **Live Mode** keys only in production.

---

Built by Accordex Systems Pvt Ltd / Softmerce Technologies.
#   i n v o i c e _ g e n e r a t o r  
 