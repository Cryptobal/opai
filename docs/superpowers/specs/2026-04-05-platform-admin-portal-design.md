# OPAI Platform Admin Portal — Design Spec

**Date:** 2026-04-05
**Status:** Approved
**Supersedes:** 2026-04-04-multi-tenant-platform-admin-design.md (partial — this covers portal only)

---

## 1. Overview

A separate admin portal at `/platform/*` for managing all OPAI tenants. Platform admins are a distinct entity from tenant admins — they manage the platform itself (tenants, billing, modules, plans).

**Key identity:** `carlos.irigoyen@opai.cl` → Platform Admin (owner of OPAI platform)

---

## 2. Data Model

### 2.1 New: PlatformAdmin

```prisma
model PlatformAdmin {
  id          String    @id @default(cuid())
  email       String    @unique
  password    String    // bcrypt 12 rounds
  name        String
  status      String    @default("active") // "active" | "suspended"
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  lastLoginAt DateTime? @map("last_login_at")

  @@index([email])
  @@map("platform_admins")
  @@schema("public")
}
```

### 2.2 Extended: Tenant

Add nullable fields to existing `Tenant` model:

```prisma
billingEmail     String?   @map("billing_email")
supportEmail     String?   @map("support_email")
notes            String?
suspendedAt      DateTime? @map("suspended_at")
suspendedReason  String?   @map("suspended_reason")
onboardedBy      String?   @map("onboarded_by")
lastActivityAt   DateTime? @map("last_activity_at")
```

### 2.3 Seed

Append to `prisma/seed.ts`:
- `PlatformAdmin` upsert for `carlos.irigoyen@opai.cl` with bcrypt-hashed password

---

## 3. Authentication

### 3.1 Platform Auth (separate from NextAuth)

**File:** `src/lib/platform-auth.ts`

- Manual JWT session using `jose` (already a dependency)
- Cookie: `platform-session` (httpOnly, secure in prod, sameSite: lax, 24h expiry)
- Secret: `PLATFORM_JWT_SECRET` env var (fallback to `NEXTAUTH_SECRET`)
- Exports: `platformLogin(email, password)`, `getPlatformSession()`, `platformLogout()`
- Coexists with `authjs.session-token` — both cookies can be active simultaneously

### 3.2 Platform API Auth

**File:** `src/lib/platform-api-auth.ts`

- `requirePlatformAuth()` → returns `{ platformAdminId, email, name }` or null
- `platformUnauthorized()` → returns 401 NextResponse
- Every `/api/platform/*` route calls `requirePlatformAuth()` as first line

### 3.3 Middleware

**File:** `src/middleware.ts` (new)

- Matches only `/platform/:path*`
- Skips `/platform/login`
- Checks `platform-session` cookie presence → redirects to `/platform/login` if missing
- Zero impact on existing routes

---

## 4. Impersonate (Option A — NextAuth signIn)

### Flow:
1. Platform admin clicks "Entrar" on a tenant
2. `POST /api/platform/tenants/[id]/impersonate` (requires platform auth)
3. API finds the tenant's owner Admin
4. Calls NextAuth `signIn("credentials")` server-side with a special `__impersonate` flag
5. `auth.ts` authorize callback: when `__impersonate` is present, validates a server-only secret (`PLATFORM_IMPERSONATE_SECRET`), skips password check, returns the admin user with `impersonating: true` and `impersonatingFrom: platformAdminEmail`
6. JWT callback passes `impersonating` and `impersonatingFrom` through
7. Session callback exposes `impersonating` to client
8. Sets `authjs.session-token` cookie, redirects to `/hub`

### Banner:
- `ImpersonateBanner` component in `src/components/platform/`
- Rendered in `src/app/(app)/layout.tsx` when `session.impersonating === true`
- Amber/warning style: "Sesión de soporte en {tenantName}. [Salir]"
- "Salir" → `DELETE /api/platform/impersonate` → destroys NextAuth session → redirect to `/platform/dashboard`

### Auth.ts Changes (minimal):
- Add to JWT type: `impersonating?: boolean`, `impersonatingFrom?: string`
- In authorize: detect `__impersonate` credential, validate secret, return admin without password check
- In jwt callback: pass through `impersonating`/`impersonatingFrom` fields
- In session callback: expose `impersonating` to session

---

## 5. Pages

### 5.1 Layout — `src/app/platform/layout.tsx`
- Dedicated layout, completely separate from `(app)` layout
- Left sidebar (PlatformSidebar) + content area
- Protected by `getPlatformSession()` — redirect to `/platform/login` if no session
- Branding: "OPAI Platform" (not tenant brand)

### 5.2 Login — `src/app/platform/login/page.tsx`
- Minimal: logo + "Platform Admin" + email/password form
- Calls `POST /api/platform/auth`
- On success → redirect `/platform/dashboard`
- No register or forgot password links

### 5.3 Dashboard — `src/app/platform/dashboard/page.tsx`

**4 KPI cards:**
1. Active tenants (count + new this month)
2. Total guards (sum of active OpsGuardia + % vs last month)
3. Estimated MRR (sum of basePrice + pricePerGuard × guards per active tenant)
4. Expiring trials (trials ending within 7 days)

**Tenant table** with columns:
- Empresa (name + slug)
- Plan (badge: trial=amber, essential=gray, professional=blue, enterprise=purple)
- Estado (badge: active=green, trial=amber+days, suspended=red)
- Guardias (active OpsGuardia count)
- Uso 30d (progress bar — modules with activity / enabled modules × 100)
- Último login (relative time from latest Admin.lastLoginAt)
- Acciones: Ver, Editar, Entrar

Table features: column sorting, status filter, pagination (20 per page)

### 5.4 Tenant Detail — `src/app/platform/tenants/[tenantId]/page.tsx`

5 sections (tabs):

1. **Info general** — name, slug, dates, billing/support email, notes (editable). Buttons: Suspend/Reactivate, Extend trial
2. **Plan y módulos** — plan badge, limits table (editable), pricing (editable), module toggles (on/off switches). "Change plan" button auto-configures modules/limits per PLAN_MODULES
3. **Administradores** — read-only table of tenant's Admins (name, email, role, lastLogin, status)
4. **Métricas** — guards/max, admins/max, marcaciones 30d, documents 30d, rounds 30d (progress bars)
5. **Auditoría** — last 20 AuditLog entries for the tenant

### 5.5 Create Tenant — `src/app/platform/tenants/new/page.tsx`

Form fields: name, slug (auto-generated), companyRut, ownerName, ownerEmail, ownerPassword, plan, trialDays.
Submit → calls `provisionTenant()` → redirect to detail page.

### 5.6 Billing — `src/app/platform/billing/page.tsx`

Table: tenant, plan, basePrice, pricePerGuard, active guards, monthly total, billingStatus.
Footer totals: MRR, total guards.
Filters by billingStatus. CSV export button.

---

## 6. API Routes

All require `requirePlatformAuth()`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/platform/auth` | Login (set cookie) |
| DELETE | `/api/platform/auth` | Logout (clear cookie) |
| GET | `/api/platform/dashboard` | KPIs + tenant list |
| GET | `/api/platform/tenants` | Paginated tenant list (filter/sort) |
| POST | `/api/platform/tenants` | Create tenant (calls provisionTenant) |
| GET | `/api/platform/tenants/[id]` | Tenant detail + plan + modules + admins + metrics |
| PATCH | `/api/platform/tenants/[id]` | Update tenant info |
| PATCH | `/api/platform/tenants/[id]/plan` | Update plan/limits/pricing |
| PATCH | `/api/platform/tenants/[id]/modules` | Toggle module on/off |
| POST | `/api/platform/tenants/[id]/suspend` | Suspend tenant |
| DELETE | `/api/platform/tenants/[id]/suspend` | Reactivate tenant |
| POST | `/api/platform/tenants/[id]/impersonate` | Create impersonate session |
| DELETE | `/api/platform/impersonate` | End impersonate session |
| GET | `/api/platform/billing` | Global billing data |

---

## 7. Usage Metrics (usagePct)

Activity queries per module (last 30 days):
- `crm` → CrmLead or CrmDeal created/updated
- `ops_asistencia` → OpsMarcacion count
- `ops_rondas` → OpsRondaEjecucion count
- `documentos` → Document count
- `payroll` → PayrollPeriodo count
- `ops_pauta` → OpsPautaDiaria count
- Others: skipped (can add incrementally)

Formula: `usagePct = modulesWithActivity / enabledModules × 100`

---

## 8. Components

| Component | File | Purpose |
|-----------|------|---------|
| PlatformSidebar | `src/components/platform/PlatformSidebar.tsx` | Navy (#0a1628) sidebar with teal (#0d9488) accents |
| PlatformKpiCard | `src/components/platform/PlatformKpiCard.tsx` | KPI card with label, value, trend |
| TenantTable | `src/components/platform/TenantTable.tsx` | Sortable/filterable/paginated tenant table |
| TenantDetailTabs | `src/components/platform/TenantDetailTabs.tsx` | Tabbed detail view with inline editing |
| CreateTenantForm | `src/components/platform/CreateTenantForm.tsx` | Tenant creation form with slug auto-gen |
| ImpersonateBanner | `src/components/platform/ImpersonateBanner.tsx` | Amber banner in (app) layout |

All use existing shadcn/ui components: Badge, Button, Card, Table, Tabs, Input, Select, Switch, Dialog, Progress.

---

## 9. Environment Variables

```
PLATFORM_JWT_SECRET=<openssl rand -hex 32>
PLATFORM_IMPERSONATE_SECRET=<openssl rand -hex 32>  # server-only, validates impersonate calls
```

---

## 10. Safety Constraints

- Existing routes unchanged — middleware only matches `/platform/:path*`
- `auth.ts` changes limited to: JWT type extension + impersonate credential support
- Seed: platform admin appended at end, existing seed untouched
- `provisionTenant()` called as-is from create tenant API
- Impersonate logs who, when, which tenant
- All platform API routes require `requirePlatformAuth()` first
- Platform admin passwords: bcrypt 12 rounds
- Platform session: httpOnly, secure (prod), sameSite lax
