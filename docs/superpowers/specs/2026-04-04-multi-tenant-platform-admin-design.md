# OPAI Multi-Tenant & Platform Admin — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Stack:** Next.js 16 App Router, TypeScript, Prisma 6, Tailwind CSS, Vercel

---

## Problem Statement

OPAI is a multi-tenant SaaS ERP for Chile's private security industry. The multi-tenant infrastructure exists (Tenant, TenantModule, TenantPlan, provisionTenant()), but two critical gaps remain:

1. **No Platform Admin portal** — tenant creation is CLI-only, no way to manage tenants via UI
2. **~347 hardcoded "Gard" references** across ~160 files — emails, URLs, logos, phones, and ~182 calls to `getDefaultTenantId()` that resolve to the original tenant "gard"

Tenant-level configuration already exists in UI (`/opai/configuracion/empresa`) with all necessary fields. The problem is that code bypasses `getTenantCompanyConfig(tenantId)` in favor of hardcoded Gard values.

### Key Identities
- `carlos.irigoyen@opai.cl` -> PLATFORM_ADMIN (OPAI platform owner)
- `carlos.irigoyen@gard.cl` -> owner of tenant "gard" (Gard operating company)

---

## Scope & Phases

Two independent workstreams, ordered by priority:

| Phase | What | Priority | Why |
|-------|------|----------|-----|
| **Fase 2 (first)** | Hardcoding cleanup | P0 | Security/correctness — other tenants receive Gard-branded emails |
| **Fase 1 (second)** | Platform Admin portal | P1 | Management — needed to administer tenants via UI |

Hardcoding cleanup ships first because it's a correctness issue affecting existing multi-tenant behavior. Platform Admin builds on a clean foundation.

---

## FASE 2: Hardcoding Cleanup

### Principle

Every company-specific value must come from `getTenantCompanyConfig(tenantId)` or tenant Settings. Never from constants, string literals, or env vars that assume a single company.

### 2.1 Categories

| Category | Count | Example | Replacement |
|----------|-------|---------|-------------|
| "Gard" strings | 211 | `"Gard SpA"`, `"GARD"` | `cfg.companyName`, `cfg.brandNameUpper` |
| @gard.cl emails | 51 | `"comercial@gard.cl"` | `cfg.email`, `cfg.emailFromAddress` |
| gard.cl URLs | 118 | `"www.gard.cl"` | `cfg.website` |
| Gard logos | 16 | `"/Logo Gard Blanco.png"` | `cfg.brandingLogoWhite` |
| Hardcoded phones | 16 | `"56982307771"` | `cfg.phone`, `cfg.phoneRaw` |
| `getDefaultTenantId()` | 182 calls | `session.user.tenantId ?? (await getDefaultTenantId())` | `session.user.tenantId` (no fallback) |

### 2.2 Step 1: Remove getDefaultTenantId() from production

**Scope:** ~85 page files + ~21 API route files

**Pattern for pages:**
```typescript
// BEFORE:
const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

// AFTER:
const tenantId = session.user.tenantId;
if (!tenantId) redirect("/opai/login");
```

**Pattern for API routes with requireAuth:**
```typescript
// BEFORE:
const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

// AFTER:
const tenantId = session.user.tenantId;
// requireAuth already guarantees tenantId exists
```

Remove `getDefaultTenantId` imports from all modified files. Keep the function in `src/lib/tenant.ts` marked deprecated for seeds/scripts only.

### 2.3 Step 2: Public API routes — tenantSlug path segment

Public routes that currently call `getDefaultTenantId()` will use a required `[tenantSlug]` path segment:

**Route changes:**
```
/api/public/leads                    -> /api/public/[tenantSlug]/leads
/api/public/postulacion              -> /api/public/[tenantSlug]/postulacion
/api/public/postulacion/upload       -> /api/public/[tenantSlug]/postulacion/upload
/api/public/postulacion/document-types -> /api/public/[tenantSlug]/postulacion/document-types
/api/public/ingreso-te               -> /api/public/[tenantSlug]/ingreso-te
/api/public/ingreso-te/upload        -> /api/public/[tenantSlug]/ingreso-te/upload
/api/public/ingreso-te/document-types -> /api/public/[tenantSlug]/ingreso-te/document-types
/api/public/registro-demo            -> /api/public/[tenantSlug]/registro-demo
```

**Resolution pattern:**
```typescript
import { resolveTenantFromSlug } from "@/lib/tenant";

export async function POST(req: Request, { params }: { params: { tenantSlug: string } }) {
  const tenant = await resolveTenantFromSlug(params.tenantSlug);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const tenantId = tenant.id;
  // ... rest of handler
}
```

**New helper in `src/lib/tenant.ts`:**
```typescript
export async function resolveTenantFromSlug(slug: string): Promise<{ id: string; name: string } | null> {
  return prisma.tenant.findUnique({
    where: { slug, active: true },
    select: { id: true, name: true },
  });
}
```

**Webhook routes** (`/api/webhook/inbound-email`, `/api/webhook/zoho`) need tenant resolution from payload content (e.g., recipient email domain mapping) — handled case-by-case.

### 2.4 Step 3: Hardcoded emails -> getTenantCompanyConfig()

Each file with `@gard.cl` email:
1. Ensure `tenantId` is available in scope
2. Call `const cfg = await getTenantCompanyConfig(tenantId)`
3. Replace:
   - `"opai@gard.cl"` -> `cfg.emailFromAddress`
   - `"comercial@gard.cl"` -> `cfg.email`
   - `"operaciones@gard.cl"` -> `cfg.emailOps`
   - `"contacto@gard.cl"` -> `cfg.emailContact`
   - `'OPAI <opai@gard.cl>'` -> `cfg.emailFrom`

**Critical email files:**
- `src/app/(app)/opai/actions/users.ts`
- `src/app/opai/forgot-password/actions.ts`
- `src/app/api/portal/cliente/forgot-pin/route.ts`
- `src/app/api/ops/rondas/monitoreo/cobertura-email/`
- `src/app/api/presentations/send-email/route.ts`
- `src/components/preview/SendEmailModal.tsx`
- `src/components/ops/rondas/CerrarTurnoModal.tsx`
- `src/components/preview/PreviewSidebar.tsx`

### 2.5 Step 4: "Gard" strings in components

**Server components:** receive `tenantId`, call `getTenantCompanyConfig(tenantId)`
**Client components:** use `useBranding()` hook

Verify `useBranding()` has no Gard fallbacks — change to generic defaults from `tenant-config.ts`.

**Key components:**
- `src/components/presentation/*` (multiple sections)
- `src/components/portal/cliente/*`
- `src/components/auth/AuthShell.tsx`
- `src/components/welcome/WelcomeScreen.tsx`
- `src/components/pdf/PricingPDF.tsx`
- `src/components/admin/DashboardHeader.tsx`
- `src/components/layout/PresentationHeader.tsx`
- `src/components/layout/PresentationFooter.tsx`

### 2.6 Step 5: Email templates (React Email)

Each template receives tenant data as props instead of hardcoding:

```typescript
// Caller:
const cfg = await getTenantCompanyConfig(tenantId);
const html = await render(CpqQuoteEmail({
  ...existingProps,
  companyName: cfg.companyName,
  logoUrl: cfg.brandingLogoFull,
  email: cfg.email,
  phone: cfg.phone,
  website: cfg.website,
}));
```

**Templates to update:**
- CpqPdfEmail, CpqQuoteEmail, CompanyPresentationEmail, PresentationEmail
- PortalClienteInviteEmail, PortalProspectoInviteEmail
- SignatureRequestEmail, UserInvitation, NotificationEmail
- RegistroDemoEmail, AlertaCoberturaEmail, AlertaAceptadaEmail
- VisitaTecnicaSupervisorEmail

### 2.7 Step 6: Lib files with hardcoding

Update all lib files that reference Gard data to use `getTenantCompanyConfig(tenantId)`:
- `src/lib/marcacion-email.ts`
- `src/lib/control-nocturno-email.ts`
- `src/lib/rondas/cobertura-email.ts`, `monitor-email.ts`, `monitor-turno-pdf.ts`
- `src/lib/cpq-mapper.ts`, `cpq-portal-email-subject.ts`
- `src/lib/email/render-template.ts`, `resolve-variables.ts`, `onboarding-email-service.ts`
- `src/lib/ai/help-chat-system-prompt.ts`, `help-chat-intents.ts`
- `src/lib/docs/token-registry.ts`, `src/lib/tokens.ts`
- `src/lib/alertas-cobertura/*.ts`
- `src/lib/pdf/templates/proposal/*`

### 2.8 Step 7: Logos and assets

Move Gard assets to tenant-scoped structure:
```
public/tenants/gard/logo-blanco.png
public/tenants/gard/logo-azul.webp
public/tenants/gard/escudo.webp
```

Code references to `/Logo Gard Blanco.png` use `cfg.brandingLogoWhite` etc.

### 2.9 Step 8: Placeholders in EmpresaConfigTabs

Change all Gard-specific placeholders to generic examples:
- `"Ej: Gard Seguridad Ltda."` -> `"Ej: Mi Empresa Seguridad Ltda."`
- `"Ej: comercial@gard.cl"` -> `"Ej: comercial@miempresa.cl"`
- etc. (13 placeholder changes + 2 fallback changes)

### 2.10 Step 9: Owner override removal

Remove from `src/app/api/crm/accounts/[id]/route.ts`:
```typescript
const OWNER_OVERRIDE_EMAILS = new Set(["carlos.irigoyen@gard.cl", "carlos@gard.cl"]);
```
Use tenant owner role for permissions instead.

### 2.11 Step 10: Marketing pages

Review `src/app/(marketing)/` pages case-by-case. OPAI marketing site should not present as Gard-specific. Gard references should be "case study" or removed.

### 2.12 Verification

Post-cleanup grep checks:
- `getDefaultTenantId` in production -> 0 results (only in `src/lib/tenant.ts` deprecated)
- `@gard.cl` in production -> 0 results (only in seeds, tests, placeholders)
- `"Gard"` in logic -> 0 results (only in seed data, test data, DB tenant records)
- `npm run build` passes

---

## FASE 1: Platform Admin

### 1.1 Data Model

**New model: PlatformAdmin**
```prisma
model PlatformAdmin {
  id          String    @id @default(cuid())
  email       String    @unique
  password    String
  name        String
  status      String    @default("active") // active, suspended
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  lastLoginAt DateTime?

  @@index([email])
  @@schema("public")
}
```

Separate from `Admin` because they live in different domains. An Admin belongs to a tenant. A PlatformAdmin operates across all tenants.

**Extend Tenant:**
```prisma
billingEmail    String?   @map("billing_email")
supportEmail    String?   @map("support_email")
notes           String?
suspendedAt     DateTime? @map("suspended_at")
suspendedReason String?   @map("suspended_reason")
onboardedBy     String?   @map("onboarded_by")
lastActivityAt  DateTime? @map("last_activity_at")
```

**Prepare AdminTenant (future use):**
```prisma
model AdminTenant {
  id        String   @id @default(cuid())
  adminId   String   @map("admin_id")
  tenantId  String   @map("tenant_id")
  role      String   @default("member")
  isDefault Boolean  @default(false) @map("is_default")
  createdAt DateTime @default(now())

  admin  Admin  @relation(fields: [adminId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([adminId, tenantId])
  @@index([adminId])
  @@index([tenantId])
  @@map("admin_tenants")
  @@schema("public")
}
```
Created now, activated in a future phase.

### 1.2 Authentication

**Separate auth system** in `src/lib/platform-auth.ts`:
- Dedicated NextAuth instance or manual cookie session for `/platform/*`
- Login at `/platform/login`
- Does NOT share session with tenant login (`/opai/login`)
- Token shape: `{ type: "platform", platformAdminId, email, name }`

**API auth guard** in `src/lib/platform-api-auth.ts`:
```typescript
export async function requirePlatformAuth(): Promise<{ platformAdminId: string; email: string; name: string }>
```

**Middleware** protection for `/platform/*` and `/api/platform/*` routes.

### 1.3 Route Structure

```
src/app/platform/
  layout.tsx                         // Dedicated layout, OPAI branding
  login/page.tsx                     // Platform admin login
  page.tsx                           // Redirect to /platform/dashboard
  dashboard/page.tsx                 // KPIs, tenant table, charts
  tenants/
    page.tsx                         // Tenant list with filters
    [tenantId]/
      page.tsx                       // Tenant detail: data, plan, modules, admins, metrics
      edit/page.tsx                  // Edit plan, modules, pricing, status
  billing/page.tsx                   // Global billing: revenue per tenant, MRR, churn
  invitations/page.tsx               // Send onboarding invitations
  settings/page.tsx                  // OPAI platform config
```

### 1.4 API Routes

```
src/app/api/platform/
  auth/route.ts                      // Login/logout
  dashboard/route.ts                 // GET global metrics
  tenants/route.ts                   // GET list, POST create
  tenants/[id]/route.ts              // GET detail, PATCH update, DELETE suspend
  tenants/[id]/modules/route.ts      // PATCH enable/disable modules
  tenants/[id]/plan/route.ts         // PATCH change plan, pricing, limits
  tenants/[id]/admins/route.ts       // GET tenant admins
  tenants/[id]/metrics/route.ts      // GET usage metrics
  tenants/[id]/impersonate/route.ts  // POST start session as tenant owner
  invitations/route.ts               // POST send onboarding invitation
  billing/route.ts                   // GET billing summary
```

### 1.5 Dashboard

**KPI cards:** Active tenants, total guards (cross-tenant), estimated MRR, trial tenants (with days remaining), new registrations (30d)

**Tenant table columns:** Name/slug, Plan, Status, # Active guards, # Admins, Last login, Created at, Actions (detail/edit/suspend/impersonate)

**Charts:** Tenant growth by month, distribution by plan, top 10 by guards

### 1.6 Tenant Detail

Capabilities:
- View/edit tenant data (name, slug, emails)
- Change plan (trial -> essential -> professional -> enterprise)
- Modify pricing (basePrice, pricePerGuard, currency)
- Change limits (maxGuards, maxAdmins, maxStorageMb)
- Enable/disable modules individually
- View tenant admins with roles
- View usage metrics (guards, marcaciones, puestos, documents)
- Suspend / reactivate
- Extend trial
- Impersonate (enter as tenant owner for support)

### 1.7 Seed

```typescript
const platformAdmin = await prisma.platformAdmin.upsert({
  where: { email: 'carlos.irigoyen@opai.cl' },
  update: {},
  create: {
    email: 'carlos.irigoyen@opai.cl',
    password: await bcrypt.hash('OpaiPlatform2026!', 12),
    name: 'Carlos Irigoyen',
    status: 'active',
  },
});
```

---

## Technical Notes

- **Auth:** NextAuth v5 in `src/lib/auth.ts`, session includes `tenantId`, `role`, `roleTemplateId`
- **Tenant config:** `getTenantCompanyConfig(tenantId)` in `src/lib/tenant-config.ts` — reads from Setting table, 5-min cache
- **Branding hook:** `useBranding()` in `src/lib/branding/useBranding.ts` — for client components
- **Provisioning:** `provisionTenant()` in `src/lib/tenant-provisioning.ts` — creates tenant + admin + plan + modules + settings
- **No middleware exists yet** — will be created for platform route protection
- **No /platform/ routes exist yet** — all new
