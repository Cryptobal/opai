# Hardcoding Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all hardcoded "Gard" references from production code, making OPAI fully multi-tenant — every company-specific value comes from `getTenantCompanyConfig(tenantId)` or tenant Settings.

**Architecture:** Mechanical find-and-replace across 160+ files following three patterns: (1) replace `getDefaultTenantId()` fallback with `session.user.tenantId` in authenticated routes, (2) add `[tenantSlug]` path segment for public API routes, (3) replace hardcoded strings/emails/logos with `getTenantCompanyConfig()` or `useBranding()` calls.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 6, React Email, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-04-multi-tenant-platform-admin-design.md`

---

## File Structure

### New files
- `src/app/api/public/[tenantSlug]/leads/route.ts` — relocated from `/api/public/leads/`
- `src/app/api/public/[tenantSlug]/postulacion/route.ts` — relocated
- `src/app/api/public/[tenantSlug]/postulacion/upload/route.ts` — relocated
- `src/app/api/public/[tenantSlug]/postulacion/document-types/route.ts` — relocated
- `src/app/api/public/[tenantSlug]/ingreso-te/route.ts` — relocated
- `src/app/api/public/[tenantSlug]/ingreso-te/upload/route.ts` — relocated
- `src/app/api/public/[tenantSlug]/ingreso-te/document-types/route.ts` — relocated
- `src/app/api/public/[tenantSlug]/registro-demo/route.ts` — relocated

### Modified files (by task)
- **Task 1:** `src/lib/tenant.ts`, `src/lib/branding/useBranding.ts`, `src/lib/tenant-config.ts`
- **Task 2:** `src/app/api/branding/route.ts`
- **Task 3:** 66 page files in `src/app/(app)/` — remove `getDefaultTenantId` fallback
- **Task 4:** 13 authenticated API routes — remove `getDefaultTenantId` fallback
- **Task 5:** 8 public API routes — relocate to `[tenantSlug]` structure
- **Task 6:** ~8 critical email-sending files — replace `@gard.cl` with `cfg.*`
- **Task 7:** 13 email templates in `src/emails/` — make Gard defaults generic
- **Task 8:** ~25 lib files in `src/lib/` — replace Gard references with `cfg.*`
- **Task 9:** ~27 component files — replace Gard strings with `useBranding()` or `cfg.*`
- **Task 10:** ~36 app page files (non-getDefaultTenantId) — replace Gard strings
- **Task 11:** ~43 API route files — replace Gard strings with `cfg.*`
- **Task 12:** `src/components/configuracion/EmpresaConfigTabs.tsx` — generic placeholders
- **Task 13:** `src/app/api/crm/accounts/[id]/route.ts` — remove `OWNER_OVERRIDE_EMAILS`
- **Task 14:** Verification — grep checks + build

### Deleted files (old locations after relocation)
- `src/app/api/public/leads/route.ts`
- `src/app/api/public/postulacion/route.ts` (+ upload, document-types)
- `src/app/api/public/ingreso-te/route.ts` (+ upload, document-types)
- `src/app/api/public/registro-demo/route.ts`

---

## Task 1: Foundation — Tenant Helpers & Branding Defaults

**Files:**
- Modify: `src/lib/tenant.ts`
- Modify: `src/lib/branding/useBranding.ts:19-31`
- Modify: `src/lib/tenant-config.ts:9-11` (comments only)

- [ ] **Step 1: Add `resolveTenantFromSlug` to tenant.ts**

Add this function at the end of `src/lib/tenant.ts`:

```typescript
/**
 * Resolve a tenant by its URL slug. Used by public API routes.
 * Returns null if tenant not found or inactive.
 */
export async function resolveTenantFromSlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  if (!slug) return null;
  return prisma.tenant.findUnique({
    where: { slug, active: true },
    select: { id: true, name: true, slug: true },
  });
}
```

- [ ] **Step 2: Fix useBranding.ts Gard default**

In `src/lib/branding/useBranding.ts`, replace line 30:

```typescript
// BEFORE:
  companyName: "Gard Security",

// AFTER:
  companyName: "OPAI",
```

- [ ] **Step 3: Clean tenant-config.ts comments**

In `src/lib/tenant-config.ts`, update the doc comment (lines 9-11) to remove Gard examples:

```typescript
// BEFORE:
 *   cfg.companyName     // "Gard SpA"
 *   cfg.commercialName  // "Gard Security"
 *   cfg.email           // "comercial@gard.cl"

// AFTER:
 *   cfg.companyName     // "Mi Empresa SpA"
 *   cfg.commercialName  // "Mi Empresa Security"
 *   cfg.email           // "comercial@miempresa.cl"
```

- [ ] **Step 4: Verify build compiles**

Run: `npx next build 2>&1 | head -30`
Expected: No type errors from our changes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant.ts src/lib/branding/useBranding.ts src/lib/tenant-config.ts
git commit -m "feat: add resolveTenantFromSlug helper, fix Gard defaults in branding"
```

---

## Task 2: Make /api/branding Tenant-Aware

**Files:**
- Modify: `src/app/api/branding/route.ts`

The branding API is public (used by welcome screen, login, client components via `useBranding()`). It currently calls `getDefaultTenantId()`. It needs to accept an optional `tenantId` query param, falling back to reading from session or returning generic OPAI defaults.

- [ ] **Step 1: Rewrite the branding route**

Replace `src/app/api/branding/route.ts` entirely:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { auth } from "@/lib/auth";
import { resolveTenantFromSlug } from "@/lib/tenant";

/**
 * GET /api/branding — Public branding config
 * Resolves tenant from: ?tenant=slug > session.user.tenantId > generic OPAI defaults
 */
export async function GET(req: NextRequest) {
  try {
    let tenantId: string | null = null;

    // 1. Try tenant slug from query param
    const slug = req.nextUrl.searchParams.get("tenant");
    if (slug) {
      const tenant = await resolveTenantFromSlug(slug);
      if (tenant) tenantId = tenant.id;
    }

    // 2. Try session
    if (!tenantId) {
      const session = await auth();
      tenantId = session?.user?.tenantId ?? null;
    }

    // 3. If no tenant resolved, return generic OPAI defaults
    if (!tenantId) {
      return NextResponse.json({
        success: true,
        data: {
          logoFull: "",
          logoIcon: "",
          logoWhite: "",
          logoDark: "",
          favicon: "",
          primaryColor: "#0056E0",
          secondaryColor: "#1DB990",
          accentColor: "#FF6B35",
          appName: "OPAI",
          tagline: "Plataforma de Gestión de Seguridad",
          companyName: "OPAI",
        },
      });
    }

    const config = await getTenantCompanyConfig(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        logoFull: config.brandingLogoFull || config.logoUrl || "",
        logoIcon: config.brandingLogoIcon || "",
        logoWhite: config.brandingLogoWhite || "",
        logoDark: config.brandingLogoDark || "",
        favicon: config.brandingFavicon || "",
        primaryColor: config.brandingPrimaryColor,
        secondaryColor: config.brandingSecondaryColor,
        accentColor: config.brandingAccentColor,
        appName: config.brandingAppName,
        tagline: config.brandingTagline,
        companyName: config.commercialName || config.companyName,
        brandNameUpper: config.brandNameUpper,
        website: config.website,
        contactEmail: config.email,
      },
    });
  } catch (error) {
    console.error("[BRANDING] Error loading public branding:", error);
    return NextResponse.json({
      success: true,
      data: {
        logoFull: "",
        logoIcon: "",
        logoWhite: "",
        logoDark: "",
        favicon: "",
        primaryColor: "#0056E0",
        secondaryColor: "#1DB990",
        accentColor: "#FF6B35",
        appName: "OPAI",
        tagline: "Plataforma de Gestión de Seguridad",
        companyName: "OPAI",
      },
    });
  }
}
```

- [ ] **Step 2: Remove getDefaultTenantId import**

Verify the old import `import { getDefaultTenantId } from "@/lib/tenant";` is removed (it's replaced by `resolveTenantFromSlug`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/branding/route.ts
git commit -m "refactor: make /api/branding tenant-aware, remove getDefaultTenantId"
```

---

## Task 3: Remove getDefaultTenantId from App Pages (66 files)

**Files:** All 66 page files in `src/app/(app)/` that import `getDefaultTenantId`

Every file follows the same pattern. The change is identical in each:

**Pattern — find:**
```typescript
import { getDefaultTenantId } from '@/lib/tenant';
```
and:
```typescript
const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
```
or:
```typescript
const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
```

**Pattern — replace with:**
Remove the import entirely. Replace the tenantId line with:
```typescript
const tenantId = session.user.tenantId;
```

No `if (!tenantId) redirect(...)` needed because these pages are inside the `(app)` layout which already requires auth and redirects to login if no session.

This task is highly parallelizable — split by module directory:

- [ ] **Step 1: Clean hub + opai pages (5 files)**

```
src/app/(app)/hub/page.tsx
src/app/(app)/opai/inicio/page.tsx
src/app/(app)/opai/configuracion/auditoria/page.tsx
src/app/(app)/opai/configuracion/crm/page.tsx
src/app/(app)/opai/configuracion/finanzas/page.tsx
src/app/(app)/opai/configuracion/firmas/page.tsx
src/app/(app)/opai/configuracion/integraciones/page.tsx
```

In each file:
1. Remove `import { getDefaultTenantId } from '@/lib/tenant';`
2. Replace `session.user.tenantId ?? (await getDefaultTenantId())` with `session.user.tenantId`
3. If `getDefaultTenantId` was the only import from `@/lib/tenant`, remove the entire import line.

- [ ] **Step 2: Clean CRM pages (12 files)**

```
src/app/(app)/crm/page.tsx
src/app/(app)/crm/accounts/page.tsx
src/app/(app)/crm/accounts/[id]/page.tsx
src/app/(app)/crm/contacts/page.tsx
src/app/(app)/crm/contacts/[id]/page.tsx
src/app/(app)/crm/cotizaciones/page.tsx
src/app/(app)/crm/cotizaciones/[id]/page.tsx
src/app/(app)/crm/deals/page.tsx
src/app/(app)/crm/deals/[id]/page.tsx
src/app/(app)/crm/installations/page.tsx
src/app/(app)/crm/installations/[id]/page.tsx
src/app/(app)/crm/leads/page.tsx
src/app/(app)/crm/leads/[id]/page.tsx
```

Same pattern as Step 1.

- [ ] **Step 3: Clean Ops pages (14 files)**

```
src/app/(app)/ops/page.tsx
src/app/(app)/ops/audit-pautas/page.tsx
src/app/(app)/ops/inventario/productos/[id]/page.tsx
src/app/(app)/ops/marcaciones/page.tsx
src/app/(app)/ops/pauta-diaria/page.tsx
src/app/(app)/ops/pauta-mensual/page.tsx
src/app/(app)/ops/ppc/page.tsx
src/app/(app)/ops/refuerzos/page.tsx
src/app/(app)/ops/rondas/alertas/page.tsx
src/app/(app)/ops/rondas/configuracion/page.tsx
src/app/(app)/ops/rondas/monitoreo/page.tsx
src/app/(app)/ops/rondas/reportes/page.tsx
src/app/(app)/ops/supervision/[id]/page.tsx
src/app/(app)/ops/supervision/asignaciones/page.tsx
src/app/(app)/ops/supervision/historial/page.tsx
src/app/(app)/ops/turnos-extra/page.tsx
```

Same pattern.

- [ ] **Step 4: Clean Finanzas pages (15 files)**

```
src/app/(app)/finanzas/page.tsx
src/app/(app)/finanzas/aprobaciones/page.tsx
src/app/(app)/finanzas/bancos/page.tsx
src/app/(app)/finanzas/conciliacion/page.tsx
src/app/(app)/finanzas/contabilidad/page.tsx
src/app/(app)/finanzas/contabilidad/asientos/nuevo/page.tsx
src/app/(app)/finanzas/facturacion/page.tsx
src/app/(app)/finanzas/facturacion/emitir/page.tsx
src/app/(app)/finanzas/facturacion/notas/credito/page.tsx
src/app/(app)/finanzas/facturacion/notas/debito/page.tsx
src/app/(app)/finanzas/pagos/page.tsx
src/app/(app)/finanzas/pagos-proveedores/page.tsx
src/app/(app)/finanzas/proveedores/page.tsx
src/app/(app)/finanzas/rendiciones/page.tsx
src/app/(app)/finanzas/rendiciones/[id]/page.tsx
src/app/(app)/finanzas/rendiciones/nueva/page.tsx
src/app/(app)/finanzas/reportes/page.tsx
```

Same pattern.

- [ ] **Step 5: Clean Personas + TE + Reportes pages (12 files)**

```
src/app/(app)/personas/comunicaciones/page.tsx
src/app/(app)/personas/comunicaciones/plantillas/[id]/page.tsx
src/app/(app)/personas/guardias/page.tsx
src/app/(app)/personas/guardias/[id]/page.tsx
src/app/(app)/personas/onboarding/page.tsx
src/app/(app)/te/aprobaciones/page.tsx
src/app/(app)/te/lotes/page.tsx
src/app/(app)/te/pagos/page.tsx
src/app/(app)/te/registro/page.tsx
src/app/(app)/reportes/dt/asistencia-diaria/page.tsx
src/app/(app)/reportes/dt/domingos-festivos/page.tsx
src/app/(app)/reportes/dt/jornada-diaria/page.tsx
src/app/(app)/reportes/dt/modificaciones-turnos/page.tsx
```

Same pattern.

- [ ] **Step 6: Verify no getDefaultTenantId remains in (app) pages**

Run: `grep -rn "getDefaultTenantId" src/app/\(app\)/ --include="*.ts" --include="*.tsx"`
Expected: 0 results.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/
git commit -m "refactor: remove getDefaultTenantId fallback from 66 app pages"
```

---

## Task 4: Remove getDefaultTenantId from Authenticated API Routes (13 files)

**Files:** API routes that use `getDefaultTenantId()` but are authenticated (NOT public routes — those are Task 5)

```
src/app/api/cpq/catalog/route.ts
src/app/api/cpq/catalog/[id]/route.ts
src/app/api/cpq/quotes/[id]/clone/route.ts
src/app/api/cpq/quotes/[id]/positions/[positionId]/clone/route.ts
src/app/api/crm/gmail/connect/route.ts
src/app/api/crm/gmail/sync/route.ts
src/app/api/ops/rondas/dashboard/route.ts
src/app/api/portal/rondas/upload/route.ts
src/app/api/presentations/send-email/route.ts
src/app/api/templates/route.ts
src/app/api/webhook/inbound-email/route.ts
src/app/api/webhook/zoho/route.ts
```

Each of these files uses `getDefaultTenantId()` as a fallback. The pattern is the same as Task 3 but these are API routes. Read each file to determine whether it uses `requireAuth()` (which provides `ctx.tenantId`) or raw session access.

- [ ] **Step 1: Fix each authenticated API route**

For each file, read it first to understand its auth pattern, then:
1. Remove `import { getDefaultTenantId } from '@/lib/tenant';`
2. If it uses `requireAuth()` → use `ctx.tenantId` (it's guaranteed non-null)
3. If it uses raw `session` → use `session.user.tenantId` (add early return if null)

**Special cases:**
- `src/app/api/webhook/inbound-email/route.ts` — This is a webhook, not authenticated by session. It needs tenant resolution from the email payload (e.g., recipient domain). Read the file and handle case-by-case. If it can't resolve tenant, return 400.
- `src/app/api/webhook/zoho/route.ts` — Similar webhook case. Resolve tenant from payload or configured mapping.

- [ ] **Step 2: Verify**

Run: `grep -rn "getDefaultTenantId" src/app/api/ --include="*.ts" --include="*.tsx" | grep -v "public/"`
Expected: 0 results (only public routes should remain, handled in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/
git commit -m "refactor: remove getDefaultTenantId from authenticated API routes"
```

---

## Task 5: Public API Routes — Add [tenantSlug] Path Segment

**Files:**
- Move: `src/app/api/public/leads/route.ts` → `src/app/api/public/[tenantSlug]/leads/route.ts`
- Move: `src/app/api/public/postulacion/route.ts` → `src/app/api/public/[tenantSlug]/postulacion/route.ts`
- Move: `src/app/api/public/postulacion/upload/route.ts` → `src/app/api/public/[tenantSlug]/postulacion/upload/route.ts`
- Move: `src/app/api/public/postulacion/document-types/route.ts` → `src/app/api/public/[tenantSlug]/postulacion/document-types/route.ts`
- Move: `src/app/api/public/ingreso-te/route.ts` → `src/app/api/public/[tenantSlug]/ingreso-te/route.ts`
- Move: `src/app/api/public/ingreso-te/upload/route.ts` → `src/app/api/public/[tenantSlug]/ingreso-te/upload/route.ts`
- Move: `src/app/api/public/ingreso-te/document-types/route.ts` → `src/app/api/public/[tenantSlug]/ingreso-te/document-types/route.ts`
- Move: `src/app/api/public/registro-demo/route.ts` → `src/app/api/public/[tenantSlug]/registro-demo/route.ts`

Also update any frontend code that references these old URLs.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/app/api/public/\[tenantSlug\]/leads
mkdir -p src/app/api/public/\[tenantSlug\]/postulacion
mkdir -p src/app/api/public/\[tenantSlug\]/postulacion/upload
mkdir -p src/app/api/public/\[tenantSlug\]/postulacion/document-types
mkdir -p src/app/api/public/\[tenantSlug\]/ingreso-te
mkdir -p src/app/api/public/\[tenantSlug\]/ingreso-te/upload
mkdir -p src/app/api/public/\[tenantSlug\]/ingreso-te/document-types
mkdir -p src/app/api/public/\[tenantSlug\]/registro-demo
```

- [ ] **Step 2: Migrate each public route**

For each route file:
1. Read the original file
2. Copy it to the new `[tenantSlug]` location
3. Replace `getDefaultTenantId()` with tenant slug resolution:

```typescript
import { resolveTenantFromSlug } from "@/lib/tenant";

// In the handler function, replace:
//   const tenantId = await getDefaultTenantId();
// With:
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 404, headers: corsHeaders },
    );
  }
  const tenantId = tenant.id;
  // ... rest unchanged
}
```

Note: Next.js 16 `params` is a Promise — use `await params`.

4. Remove the `getDefaultTenantId` import
5. Delete the original file at the old location

- [ ] **Step 3: Update frontend references to old public API URLs**

Search for references to the old URLs and update them:

```bash
grep -rn "/api/public/leads\|/api/public/postulacion\|/api/public/ingreso-te\|/api/public/registro-demo" src/ --include="*.ts" --include="*.tsx" | grep -v "route.ts" | grep -v "\[tenantSlug\]"
```

Key files to check:
- `src/components/public/TePublicForm.tsx` — update fetch URL to include tenantSlug
- `src/components/public/PostulacionPublicForm.tsx` — update fetch URL
- `src/app/registro-demo/page.tsx` — update form action URL
- `src/app/ingreso-te/page.tsx` — update form action URL
- Marketing pages that embed form URLs

These public forms need the `tenantSlug` passed as a prop or read from the URL context. The pages that host these forms (e.g., `/postulacion/[token]`, `/ingreso-te`) should extract the tenant slug from their own context and pass it down.

- [ ] **Step 4: Verify no getDefaultTenantId in public routes**

Run: `grep -rn "getDefaultTenantId" src/app/api/public/ --include="*.ts"`
Expected: 0 results.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/public/
git commit -m "refactor: add [tenantSlug] path segment to public API routes"
```

---

## Task 6: Fix Hardcoded Emails in Critical Sending Files

**Files:** Files that send emails with hardcoded `@gard.cl` addresses

```
src/app/(app)/opai/actions/users.ts
src/app/opai/forgot-password/actions.ts
src/app/api/portal/cliente/forgot-pin/route.ts
src/app/api/ops/rondas/monitoreo/cobertura-email/route.ts
src/app/api/presentations/send-email/route.ts
src/components/preview/SendEmailModal.tsx
src/components/ops/rondas/CerrarTurnoModal.tsx
src/components/preview/PreviewSidebar.tsx
```

- [ ] **Step 1: Fix each email-sending file**

For each file:
1. Read it to find hardcoded `@gard.cl` emails
2. Ensure `tenantId` is available in scope (from session, context, or props)
3. Add `import { getTenantCompanyConfig } from "@/lib/tenant-config";` if not present
4. Call `const cfg = await getTenantCompanyConfig(tenantId);`
5. Replace hardcoded emails:
   - `"opai@gard.cl"` or `'OPAI <opai@gard.cl>'` → `cfg.emailFrom`
   - `"comercial@gard.cl"` → `cfg.email`
   - `"operaciones@gard.cl"` → `cfg.emailOps`
   - `"contacto@gard.cl"` → `cfg.emailContact`
   - `process.env.EMAIL_FROM || 'OPAI <opai@gard.cl>'` → `cfg.emailFrom`

**For client components** (`SendEmailModal.tsx`, `CerrarTurnoModal.tsx`, `PreviewSidebar.tsx`):
These can't call `getTenantCompanyConfig()` directly. They should:
1. Receive email config as props from their parent server component, OR
2. Fetch from `/api/branding` (which now returns `contactEmail`), OR
3. Use a new lightweight API endpoint to get tenant email config

The simplest approach: these client components should receive `defaultBcc` / `defaultEmail` as props from their server parent. Find where they're rendered and pass the tenant config down.

- [ ] **Step 2: Verify no @gard.cl in email-sending files**

Run: `grep -rn "@gard\.cl" src/app/\(app\)/opai/actions/ src/app/opai/forgot-password/ src/app/api/portal/cliente/forgot-pin/ src/app/api/ops/rondas/monitoreo/cobertura-email/ src/app/api/presentations/send-email/ src/components/preview/ src/components/ops/rondas/CerrarTurnoModal.tsx`
Expected: 0 results.

- [ ] **Step 3: Commit**

```bash
git add src/app/ src/components/preview/ src/components/ops/
git commit -m "refactor: replace hardcoded @gard.cl emails with tenant config"
```

---

## Task 7: Fix Email Templates (React Email)

**Files:** All 13 email templates in `src/emails/`

```
src/emails/UserInvitation.tsx
src/emails/CpqQuoteEmail.tsx
src/emails/CpqPdfEmail.tsx
src/emails/PresentationEmail.tsx
src/emails/CompanyPresentationEmail.tsx
src/emails/PortalClienteInviteEmail.tsx
src/emails/PortalProspectoInviteEmail.tsx
src/emails/RegistroDemoEmail.tsx
src/emails/VisitaTecnicaSupervisorEmail.tsx
src/emails/AlertaCoberturaEmail.tsx
src/emails/AlertaAceptadaEmail.tsx
src/emails/NotificationEmail.tsx
src/emails/SignatureRequestEmail.tsx (check if it has Gard refs)
```

These templates receive branding as props with Gard defaults. The fix: change default prop values to generic OPAI defaults.

- [ ] **Step 1: Fix default prop values in each template**

For each email template, replace default prop values:

```typescript
// BEFORE:
brandName = 'Gard Security',
brandNameUpper = 'GARD SECURITY',
logoUrl = 'https://opai.gard.cl/Logo%20Gard%20Blanco.png',
website = 'https://gard.cl',
emailContact = 'comercial@gard.cl',
platformName = 'Gard Docs',
portalUrl = 'https://opai.gard.cl/portal/cliente',

// AFTER:
brandName = 'OPAI',
brandNameUpper = 'OPAI',
logoUrl = '',
website = '',
emailContact = '',
platformName = 'OPAI',
portalUrl = '',
```

Also replace hardcoded `SITE_URL` constants:

```typescript
// BEFORE:
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";

// AFTER:
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "";
```

- [ ] **Step 2: Fix inline Gard text in templates**

Some templates have inline text like:
- `"Por qué elegir Gard Security"` → `"Por qué elegirnos"` or receive as prop
- `"Gard Security SpA. Todos los derechos reservados."` → `"{brandName}. Todos los derechos reservados."`
- `"Ejecutivo Comercial · Gard Security"` → `"Ejecutivo Comercial · {brandName}"`
- `"plataforma OPAI de Gard Security"` → `"plataforma OPAI de {brandName}"`
- `"www.gard.cl"` → use `{website}` prop
- `"comercial@gard.cl"` → use `{emailContact}` prop

Read each file carefully and replace ALL hardcoded Gard text with the corresponding prop.

- [ ] **Step 3: Verify callers pass tenant config**

The callers of these email templates must pass tenant branding props. Search for where each template is imported and verify the caller passes `getTenantCompanyConfig(tenantId)` data:

```bash
grep -rn "UserInvitationEmail\|CpqQuoteEmail\|CpqPdfEmail\|PresentationEmail\|CompanyPresentationEmail\|PortalClienteInviteEmail\|PortalProspectoInviteEmail\|RegistroDemoEmail\|VisitaTecnicaSupervisorEmail\|AlertaCoberturaEmail\|AlertaAceptadaEmail\|NotificationEmail\|SignatureRequestEmail" src/ --include="*.ts" --include="*.tsx" | grep -v "src/emails/" | grep "import\|from"
```

For each caller, ensure it passes branding props from `getTenantCompanyConfig(tenantId)`. If it doesn't already, add the config lookup and pass the relevant fields.

- [ ] **Step 4: Verify no Gard references in emails**

Run: `grep -rn "gard\|Gard\|GARD" src/emails/ --include="*.tsx"`
Expected: 0 results.

- [ ] **Step 5: Commit**

```bash
git add src/emails/
git commit -m "refactor: replace Gard defaults in email templates with generic OPAI defaults"
```

---

## Task 8: Fix Lib Files with Gard References

**Files:** 28 lib files that reference Gard

```
src/lib/email/resolve-variables.ts
src/lib/email/render-template.ts
src/lib/email/onboarding-email-service.ts
src/lib/marcacion-email.ts
src/lib/control-nocturno-email.ts
src/lib/rondas/cobertura-email.ts
src/lib/rondas/monitor-email.ts
src/lib/rondas/monitor-turno-pdf.ts
src/lib/rondas/monitor-turno-pdf 2.ts
src/lib/portal-cliente.ts
src/lib/portal/report-pdf.tsx
src/lib/cpq-mapper.ts (check)
src/lib/cpq-portal-email-subject.ts
src/lib/pdf/templates/proposal/build-proposal-props.ts
src/lib/pdf/templates/proposal/render-proposal.ts
src/lib/pdf/templates/proposal/render-proposal-html.ts
src/lib/pdf/templates/proposal/proposal-ai.ts
src/lib/ai/help-chat-system-prompt.ts
src/lib/ai/help-chat-intents.ts
src/lib/alertas-cobertura/whatsapp.service.ts
src/lib/alertas-cobertura/notificacion.service.ts
src/lib/tokens.ts
src/lib/personas.ts
src/lib/email-lead-extractor.ts
src/lib/branding/useBranding.ts (already fixed in Task 1)
src/lib/tenant-config.ts (already fixed in Task 1)
```

- [ ] **Step 1: Fix URL fallbacks**

Key pattern — replace `"https://opai.gard.cl"` fallbacks:

In `src/lib/email/resolve-variables.ts`:
```typescript
// BEFORE:
const DEFAULT_BASE_URL = "https://opai.gard.cl";

// AFTER:
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "";
```

Apply same pattern in all files that have `opai.gard.cl` URL fallbacks.

- [ ] **Step 2: Fix email-related lib files**

For each email lib file (`marcacion-email.ts`, `control-nocturno-email.ts`, `rondas/cobertura-email.ts`, `rondas/monitor-email.ts`):
1. Read the file
2. These functions should already receive `tenantId` as a parameter (or can get it from their context)
3. Add `const cfg = await getTenantCompanyConfig(tenantId);` if not already present
4. Replace hardcoded Gard emails/names/URLs with `cfg.*` properties

- [ ] **Step 3: Fix PDF generation files**

For `monitor-turno-pdf.ts`, `report-pdf.tsx`, `proposal/*` files:
1. These generate PDFs with Gard branding
2. Ensure they receive `tenantId` and use `getTenantCompanyConfig(tenantId)` for branding
3. Replace hardcoded logos, names, colors

- [ ] **Step 4: Fix AI system prompts**

In `src/lib/ai/help-chat-system-prompt.ts` and `help-chat-intents.ts`:
1. Replace hardcoded "Gard" references with dynamic tenant name
2. These functions should receive `tenantId` and use `cfg.companyName` / `cfg.commercialName`

- [ ] **Step 5: Fix alertas-cobertura services**

In `src/lib/alertas-cobertura/whatsapp.service.ts` and `notificacion.service.ts`:
1. Replace Gard-specific WhatsApp messages with tenant-aware text using `cfg.*`

- [ ] **Step 6: Fix tokens.ts and personas.ts**

Read each file and replace any Gard-specific strings with `cfg.*` lookups.

- [ ] **Step 7: Delete duplicate file**

```bash
rm "src/lib/rondas/monitor-turno-pdf 2.ts"
```

This is a duplicate file with a space in the name — likely an accidental copy.

- [ ] **Step 8: Verify no Gard in lib files**

Run: `grep -rn "gard\|Gard\|GARD\|@gard" src/lib/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|mock-data\|tenant\.ts"`
Expected: 0 results (excluding tests, mock data, and the deprecated tenant.ts slug constant).

- [ ] **Step 9: Commit**

```bash
git add src/lib/
git commit -m "refactor: replace Gard references in lib files with tenant config"
```

---

## Task 9: Fix Components with Gard References (27 files)

**Files:** All component files in `src/components/` that reference Gard

```
src/components/presentation/PresentationRenderer.tsx
src/components/presentation/sections/Section25Comparacion.tsx
src/components/portal/cliente/PortalDashboard.tsx
src/components/portal/cliente/CompanyPresentationView.tsx
src/components/portal/cliente/PortalNosotros.tsx
src/components/portal/cliente/tour/tour-steps.ts
src/components/auth/AuthShell.tsx
src/components/welcome/WelcomeScreen.tsx
src/components/admin/DashboardHeader.tsx
src/components/admin/PresentationsList.tsx
src/components/layout/PresentationHeader.tsx
src/components/layout/PresentationFooter.tsx
src/components/ops/GuardiasClient.tsx
src/components/ops/OpsMarcacionesClient.tsx
src/components/ops/rondas/RondasReportPDF.tsx
src/components/crm/CrmLeadDetailClient.tsx
src/components/crm/CrmInstallationDetailClient.tsx
src/components/crm/protocol/ClientViewSubTab.tsx
src/components/public/TePublicForm.tsx
src/components/public/PostulacionPublicForm.tsx
src/components/comunicaciones/TemplateEditorClient.tsx
src/components/marketing/MobileNav.tsx
src/components/pdf/PricingPDF.tsx (check)
src/components/preview/SuccessModal.tsx
```

- [ ] **Step 1: Fix client components using useBranding()**

For client components (files with `"use client"` or that use hooks):
1. Import `useBranding` if not already imported
2. Replace hardcoded "Gard Security", "GARD", logos, URLs with `branding.*` properties
3. If the component receives branding as props, update the prop defaults to generic values

- [ ] **Step 2: Fix server components using getTenantCompanyConfig()**

For server components:
1. Ensure `tenantId` is available (from props or context)
2. Call `const cfg = await getTenantCompanyConfig(tenantId);`
3. Replace hardcoded Gard strings with `cfg.*`

- [ ] **Step 3: Fix presentation components**

`PresentationRenderer.tsx`, `Section25Comparacion.tsx`, `PresentationHeader.tsx`, `PresentationFooter.tsx`:
These render customer-facing presentations and should use the tenant's branding from the quote/deal data. Check if they receive branding props and update accordingly.

- [ ] **Step 4: Fix portal/cliente components**

`PortalDashboard.tsx`, `CompanyPresentationView.tsx`, `PortalNosotros.tsx`, `tour-steps.ts`:
These are client-portal facing and should use `useBranding()` for tenant-specific display.

- [ ] **Step 5: Fix public form components**

`TePublicForm.tsx`, `PostulacionPublicForm.tsx`:
These submit to public API routes — update the API URLs to include `tenantSlug` (from page props or URL context).

- [ ] **Step 6: Verify**

Run: `grep -rn "gard\|Gard\|GARD\|@gard" src/components/ --include="*.ts" --include="*.tsx" | grep -v "EmpresaConfigTabs\|placeholder\|Ej:"`
Expected: 0 results.

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "refactor: replace Gard references in components with tenant branding"
```

---

## Task 10: Fix App Pages with Gard References (non-getDefaultTenantId)

**Files:** 36 app page/component files that have Gard strings but NOT the `getDefaultTenantId` pattern (that was handled in Task 3)

```
src/app/(marketing)/layout.tsx
src/app/(marketing)/registrarse/page.tsx
src/app/portal/cliente/PortalClienteClient.tsx
src/app/portal/marcacion/_components/FaceRegistrationFlow.tsx
src/app/portal/acceso/_components/LoginScreen.tsx
src/app/(app)/crm/cotizaciones/[id]/page.tsx
src/app/registro-demo/confirmacion/page.tsx
src/app/registro-demo/page.tsx
src/app/ingreso-te/page.tsx
src/app/(app)/hub/_lib/hub-types.ts
src/app/descargar/marcacion/page.tsx
src/app/descargar/acceso/page.tsx
src/app/descargar/supervisor/page.tsx
src/app/descargar/page.tsx
src/app/descargar/rondas/page.tsx
src/app/descargar/cliente/page.tsx
src/app/descargar/guardia/page.tsx
src/app/(templates)/p/[uniqueId]/page.tsx
src/app/(templates)/p/[uniqueId]/opengraph-image.tsx
src/app/(templates)/preview/[sessionId]/email-preview/page.tsx
src/app/(templates)/templates/pricing-format/page.tsx
src/app/(templates)/templates/email/preview/page.tsx
src/app/(templates)/layout.tsx
src/app/opai/login/LoginPageClient.tsx
src/app/opai/login/LoginForm.tsx
src/app/opai/forgot-password/page.tsx
src/app/opai/forgot-password/ForgotPasswordForm.tsx
src/app/opai/forgot-password/actions.ts
src/app/opai/reset-password/page.tsx
src/app/marcar/[code]/MarcacionClient.tsx
src/app/marcar/[code]/page.tsx
src/app/portal/guardia/page.tsx
src/app/portal/cliente/setup/page.tsx
src/app/ronda/[code]/page.tsx
src/app/postulacion/[token]/page.tsx
src/app/(app)/opai/actions/users.ts
```

- [ ] **Step 1: Read and fix each file**

For each file:
1. Read to find exact Gard references
2. Determine if it's a client or server component
3. Client → use `useBranding()` or receive branding as props
4. Server → use `getTenantCompanyConfig(tenantId)` where tenantId is available
5. For pages without tenant context (public pages like `/descargar/*`, `/opai/login`), use generic "OPAI" branding or fetch from `/api/branding`

**Special cases:**
- Marketing pages (`(marketing)/layout.tsx`, `registrarse/page.tsx`) — these are OPAI product pages, not tenant pages. Replace "Gard" with "OPAI" branding or remove Gard references. Keep Gard only if used as a case study example.
- Login pages — use generic OPAI branding or `useBranding()` which already fetches from `/api/branding`
- Download pages (`/descargar/*`) — these are app download pages, use generic OPAI branding

- [ ] **Step 2: Verify**

Run: `grep -rn "gard\|Gard\|GARD\|@gard" src/app/ --include="*.ts" --include="*.tsx" | grep -v "api/\|node_modules\|EmpresaConfigTabs\|__tests__"`
Expected: 0 results.

- [ ] **Step 3: Commit**

```bash
git add src/app/
git commit -m "refactor: replace Gard references in app pages with tenant-aware branding"
```

---

## Task 11: Fix API Routes with Gard References (43 files)

**Files:** API routes that have `@gard.cl` or "Gard" strings (excluding the `getDefaultTenantId` pattern already handled in Tasks 4-5)

These 43 routes have Gard strings in their business logic — email sending, PDF generation, AI prompts, etc.

- [ ] **Step 1: Fix each API route**

For each file:
1. Read it to find Gard references
2. The route already has `tenantId` from auth context
3. Add `const cfg = await getTenantCompanyConfig(tenantId);` if not present
4. Replace:
   - Hardcoded email addresses → `cfg.emailFrom`, `cfg.email`, `cfg.emailOps`
   - Hardcoded company names → `cfg.companyName`, `cfg.commercialName`
   - Hardcoded URLs → `cfg.website`
   - Hardcoded logo URLs → `cfg.brandingLogoWhite`, `cfg.brandingLogoFull`
   - Hardcoded phone numbers → `cfg.phone`, `cfg.phoneRaw`

**High-priority routes** (customer-facing emails):
```
src/app/api/cpq/quotes/[id]/send-email/route.ts
src/app/api/cpq/quotes/[id]/send-pdf-email/route.ts
src/app/api/cpq/quotes/[id]/send-presentation/route.ts
src/app/api/cpq/quotes/[id]/solicitar-visita-tecnica/route.ts
src/app/api/crm/contacts/[id]/portal/send-email/route.ts
src/app/api/crm/contacts/[id]/send-presentation/route.ts
src/app/api/crm/leads/[id]/proposal-preview/route.ts
src/app/api/crm/leads/[id]/cpq-preview/route.ts
src/app/api/docs/documents/[id]/signature-request/route.ts
src/app/api/docs/documents/[id]/signature-request/resend/[recipientId]/route.ts
src/app/api/portal/cliente/auth/route.ts
src/app/api/portal/cliente/forgot-pin/route.ts
```

- [ ] **Step 2: Verify**

Run: `grep -rn "@gard\.cl\|gard\.cl\|Gard S\|\"GARD\"" src/app/api/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|mock"`
Expected: 0 results.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/
git commit -m "refactor: replace Gard references in API routes with tenant config"
```

---

## Task 12: Fix EmpresaConfigTabs Placeholders

**Files:**
- Modify: `src/components/configuracion/EmpresaConfigTabs.tsx`

- [ ] **Step 1: Replace placeholder examples**

In `src/components/configuracion/EmpresaConfigTabs.tsx`, replace all Gard-specific placeholder text:

```typescript
// FIELDS array (lines ~12-21):
"Ej: Gard Seguridad Ltda."       → "Ej: Mi Empresa Seguridad Ltda."

// BRAND_FIELDS array (lines ~23-29):
"Ej: Gard SpA"                    → "Ej: Mi Empresa SpA"
"Ej: Gard Security"               → "Ej: Mi Empresa Security"
"Ej: GARD"                        → "Ej: MIEMPRESA"
"Ej: www.gard.cl"                 → "Ej: www.miempresa.cl"

// CONTACT_FIELDS array (lines ~31-38):
"Ej: comercial@gard.cl"           → "Ej: comercial@miempresa.cl"
"Ej: operaciones@gard.cl"         → "Ej: operaciones@miempresa.cl"
"Ej: contacto@gard.cl"            → "Ej: contacto@miempresa.cl"
"Ej: +56 98 230 7771"             → "Ej: +56 9 1234 5678"
"Ej: 56982307771"                 → "Ej: 56912345678"
"Ej: https://wa.me/56982307771"   → "Ej: https://wa.me/56912345678"

// EMAIL_FIELDS (lines ~40-44):
"Ej: opai@gard.cl"                → "Ej: notificaciones@miempresa.cl"
"Ej: comercial@gard.cl"           → "Ej: comercial@miempresa.cl"
```

- [ ] **Step 2: Fix preview fallbacks**

Replace any fallback values in the email preview section (~line 278+):
```typescript
// BEFORE:
fallback "opai@gard.cl"            → "correo@miempresa.cl"
fallback "comercial@gard.cl"        → "comercial@miempresa.cl"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/configuracion/EmpresaConfigTabs.tsx
git commit -m "refactor: replace Gard placeholders in empresa config with generic examples"
```

---

## Task 13: Remove OWNER_OVERRIDE_EMAILS

**Files:**
- Modify: `src/app/api/crm/accounts/[id]/route.ts`

- [ ] **Step 1: Read the file and understand the override**

Read `src/app/api/crm/accounts/[id]/route.ts` to understand how `OWNER_OVERRIDE_EMAILS` is used.

The current code (line ~15):
```typescript
const OWNER_OVERRIDE_EMAILS = new Set(["carlos.irigoyen@gard.cl", "carlos@gard.cl"]);
```

Used (~line 154) to check if a user can downgrade an account:
```typescript
const canDowngrade =
  admin?.role === "owner" &&
  (OWNER_OVERRIDE_EMAILS.has(normalizedEmail) || normalizedName === "carlos irigoyen");
```

- [ ] **Step 2: Replace with role-based check**

Remove the `OWNER_OVERRIDE_EMAILS` constant. Replace the check with a simple role check:

```typescript
// BEFORE:
const canDowngrade =
  admin?.role === "owner" &&
  (OWNER_OVERRIDE_EMAILS.has(normalizedEmail) || normalizedName === "carlos irigoyen");

// AFTER:
const canDowngrade = admin?.role === "owner";
```

The owner role already has full permissions. The email/name check was a workaround.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/crm/accounts/\[id\]/route.ts
git commit -m "refactor: remove hardcoded owner override emails, use role-based check"
```

---

## Task 14: Verification & Build

- [ ] **Step 1: Check for remaining getDefaultTenantId in production**

Run:
```bash
grep -rn "getDefaultTenantId" src/ --include="*.ts" --include="*.tsx" | grep -v "lib/tenant\.ts\|__tests__\|\.test\.\|mock"
```

Expected: **0 results**. The function should only exist in `src/lib/tenant.ts` as a deprecated export and possibly in test files.

- [ ] **Step 2: Check for remaining @gard.cl in production**

Run:
```bash
grep -rn "@gard\.cl" src/ --include="*.ts" --include="*.tsx" | grep -v "placeholder\|Ej:\|__tests__\|\.test\.\|mock\|seed\|EmpresaConfigTabs"
```

Expected: **0 results**.

- [ ] **Step 3: Check for remaining "Gard" strings in production**

Run:
```bash
grep -rn "\"Gard\|'Gard\|Gard S" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\.\|mock-data\|seed\|tenant\.ts\|EmpresaConfigTabs"
```

Expected: **0 results** in logic code. May have results in marketing pages as case studies — review individually.

- [ ] **Step 4: Check for hardcoded gard.cl URLs**

Run:
```bash
grep -rn "gard\.cl\|opai\.gard" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\.\|mock\|seed\|tenant\.ts"
```

Expected: **0 results**.

- [ ] **Step 5: Full build check**

Run:
```bash
npx next build
```

Expected: Build succeeds with no type errors. May have warnings, but no errors.

- [ ] **Step 6: Check for unused imports**

Run:
```bash
grep -rn "import.*getDefaultTenantId" src/ --include="*.ts" --include="*.tsx" | grep -v "lib/tenant\.ts"
```

Expected: **0 results** — no file should import `getDefaultTenantId` anymore (except the definition file).

- [ ] **Step 7: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: resolve remaining hardcoding issues found during verification"
```

---

## Execution Notes

### Parallelization Strategy

Tasks 3-5 (getDefaultTenantId removal) can run in parallel with Tasks 6-11 (Gard string replacement) since they touch different aspects of the same files. However, within each group, maintain order because later tasks may depend on patterns established in earlier ones.

**Recommended parallel groups:**
- **Group A (getDefaultTenantId):** Task 3 → Task 4 → Task 5
- **Group B (Gard strings):** Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11
- **Group C (quick fixes):** Task 12 + Task 13 (independent, can run anytime)
- **Final:** Task 14 (depends on all above)

Tasks 1 and 2 must complete before any other task starts (foundation).

### Key Reference: TenantCompanyConfig Fields

When replacing Gard strings, use these `cfg.*` field names (from `src/lib/tenant-config.ts`):

| Hardcoded value | Replace with |
|----------------|--------------|
| `"Gard SpA"` | `cfg.companyName` |
| `"Gard Security"` | `cfg.commercialName` |
| `"GARD"` | `cfg.brandNameUpper` |
| `"www.gard.cl"` | `cfg.website` |
| `"comercial@gard.cl"` | `cfg.email` |
| `"operaciones@gard.cl"` | `cfg.emailOps` |
| `"contacto@gard.cl"` | `cfg.emailContact` |
| `"opai@gard.cl"` | `cfg.emailFromAddress` |
| `'OPAI <opai@gard.cl>'` | `cfg.emailFrom` |
| `"+56 98 230 7771"` | `cfg.phone` |
| `"56982307771"` | `cfg.phoneRaw` |
| `"https://wa.me/56982307771"` | `cfg.whatsappLink` |
| `"/Logo Gard Blanco.png"` | `cfg.brandingLogoWhite` |
| `"https://opai.gard.cl"` | `process.env.NEXT_PUBLIC_SITE_URL \|\| process.env.NEXTAUTH_URL \|\| ""` |
