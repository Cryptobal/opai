# Platform Admin — Pricing Catalog, Add-ons & Billing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrable pricing catalogs (plans, add-ons, packs) to the Platform Admin portal, with per-tenant add-on management, billing formula calculation, and plan name migration.

**Architecture:** Three new catalog models (PlanCatalog, AddonCatalog, PackCatalog) + TenantAddon join table. TenantPlan extended with catalog reference and custom overrides. Billing formula: `max(pricePerGuard × guards, baseMinimum) + addons - packDiscounts`. Currency in UF. Plan slugs migrated from trial/essential/professional/enterprise to free/starter/profesional/enterprise.

**Tech Stack:** Prisma 6, Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui.

**Spec:** User-provided addendum in conversation (2026-04-05).

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `prisma/seeds/pricing-catalog-seed.ts` | Seed plans, add-ons, packs catalogs |
| `src/app/api/platform/catalog/plans/route.ts` | GET all plans |
| `src/app/api/platform/catalog/plans/[id]/route.ts` | PATCH plan |
| `src/app/api/platform/catalog/addons/route.ts` | GET all add-ons |
| `src/app/api/platform/catalog/addons/[id]/route.ts` | PATCH add-on |
| `src/app/api/platform/catalog/packs/route.ts` | GET all packs |
| `src/app/api/platform/catalog/packs/[id]/route.ts` | PATCH pack |
| `src/app/api/platform/tenants/[id]/addons/route.ts` | GET/POST/DELETE tenant add-ons |
| `src/app/api/platform/tenants/[id]/addons/pack/route.ts` | POST apply pack |
| `src/app/platform/pricing/page.tsx` | Pricing catalog management (replace placeholder) |
| `src/components/platform/PlanCatalogTable.tsx` | Editable plans table |
| `src/components/platform/AddonCatalogTable.tsx` | Editable add-ons table |
| `src/components/platform/PackCatalogCards.tsx` | Pack cards with editing |
| `src/components/platform/TenantAddonsSection.tsx` | Tenant add-on toggles + billing summary |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add PlanCatalog, AddonCatalog, PackCatalog, TenantAddon models + TenantPlan fields |
| `prisma/seed.ts` | Import and call pricing catalog seed |
| `src/lib/tenant-modules.ts` | Migrate PLAN_MODULES keys: trial→free, essential→starter, professional→profesional |
| `src/lib/tenant-provisioning.ts` | Migrate plan type + link to PlanCatalog |
| `src/components/platform/TenantDetailTabs.tsx` | Replace "Plan y Módulos" tab with TenantAddonsSection |
| `src/app/api/platform/billing/route.ts` | Enhanced billing formula with add-ons and packs |
| `src/app/platform/billing/page.tsx` | Enhanced billing UI with add-on breakdown |

---

### Task 1: Schema — New catalog models + TenantPlan extension

**Files:**
- Modify: `prisma/schema.prisma` — after PlatformAdmin model (line ~134), add new models. Modify TenantPlan (line 97-119). Add relation to Tenant model.

- [ ] **Step 1: Add PlanCatalog model**

After the `PlatformAdmin` model closing brace (after `@@schema("public")`), add:

```prisma
model PlanCatalog {
  id              String   @id @default(cuid())
  slug            String   @unique
  name            String
  headline        String?
  description     String?
  pricePerGuard   Decimal  @default(0) @map("price_per_guard") @db.Decimal(10, 4)
  baseMinimum     Decimal  @default(0) @map("base_minimum") @db.Decimal(10, 2)
  maxGuards       Int      @default(10) @map("max_guards")
  maxAdmins       Int      @default(1) @map("max_admins")
  maxStorageMb    Int      @default(1000) @map("max_storage_mb")
  includedModules String[] @map("included_modules")
  trialDays       Int      @default(30) @map("trial_days")
  sortOrder       Int      @default(0) @map("sort_order")
  featured        Boolean  @default(false)
  active          Boolean  @default(true)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("plan_catalog")
  @@schema("public")
}
```

- [ ] **Step 2: Add AddonCatalog model**

```prisma
model AddonCatalog {
  id           String   @id @default(cuid())
  slug         String   @unique
  name         String
  description  String?
  pricingModel String   @map("pricing_model")
  priceAmount  Decimal  @default(0) @map("price_amount") @db.Decimal(10, 4)
  priceUnit    String?  @map("price_unit")
  moduleKey    String?  @map("module_key")
  tag          String?
  sortOrder    Int      @default(0) @map("sort_order")
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  tenantAddons TenantAddon[]

  @@map("addon_catalog")
  @@schema("public")
}
```

- [ ] **Step 3: Add PackCatalog model**

```prisma
model PackCatalog {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?
  addonSlugs  String[] @map("addon_slugs")
  discountPct Decimal  @default(0) @map("discount_pct") @db.Decimal(5, 2)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("pack_catalog")
  @@schema("public")
}
```

- [ ] **Step 4: Add TenantAddon model**

```prisma
model TenantAddon {
  id            String    @id @default(cuid())
  tenantId      String    @map("tenant_id")
  addonId       String    @map("addon_id")
  enabled       Boolean   @default(true)
  customPrice   Decimal?  @map("custom_price") @db.Decimal(10, 4)
  packId        String?   @map("pack_id")
  activatedAt   DateTime  @default(now()) @map("activated_at")
  deactivatedAt DateTime? @map("deactivated_at")

  tenant Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  addon  AddonCatalog @relation(fields: [addonId], references: [id], onDelete: Cascade)

  @@unique([tenantId, addonId])
  @@index([tenantId])
  @@map("tenant_addons")
  @@schema("public")
}
```

- [ ] **Step 5: Extend TenantPlan model**

Add these fields to the existing TenantPlan model (after `mpSubscriptionId`):

```prisma
  planCatalogId       String?  @map("plan_catalog_id")
  customPricePerGuard Decimal? @map("custom_price_per_guard") @db.Decimal(10, 4)
  customBaseMinimum   Decimal? @map("custom_base_minimum") @db.Decimal(10, 2)
```

Also change the `currency` default from `"USD"` to `"UF"`:

```prisma
  currency           String    @default("UF")
```

And change the `pricePerGuard` precision from `Decimal(10, 2)` to `Decimal(10, 4)`:

```prisma
  pricePerGuard      Decimal   @default(0) @map("price_per_guard") @db.Decimal(10, 4)
```

- [ ] **Step 6: Add tenantAddons relation to Tenant model**

In the Tenant model (line ~69, before `modules`), add:

```prisma
  tenantAddons        TenantAddon[]
```

- [ ] **Step 7: Run migration**

```bash
npx prisma db push
```

Note: Use `db push` instead of `migrate dev` due to the known shadow DB issue with multi-schema.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add PlanCatalog, AddonCatalog, PackCatalog, TenantAddon models"
```

---

### Task 2: Migrate plan slugs — trial→free, essential→starter, professional→profesional

**Files:**
- Modify: `src/lib/tenant-modules.ts`
- Modify: `src/lib/tenant-provisioning.ts`

- [ ] **Step 1: Update PLAN_MODULES in tenant-modules.ts**

Replace the `PLAN_MODULES` object keys. Keep old keys as aliases for backward compatibility:

```typescript
export const PLAN_MODULES: Record<string, TenantModuleKey[]> = {
  free: [
    "ops_asistencia",
    "ops_pauta",
    "portal_supervisor",
    "portal_guardia",
  ],
  starter: [
    "ops_asistencia",
    "ops_pauta",
    "ops_rondas",
    "documentos",
    "portal_supervisor",
    "portal_guardia",
  ],
  profesional: [
    "crm",
    "ops_asistencia",
    "ops_rondas",
    "ops_pauta",
    "ops_supervision",
    "documentos",
    "portal_cliente",
    "portal_supervisor",
    "portal_guardia",
    "chat",
  ],
  enterprise: [
    "crm",
    "cpq",
    "ops_asistencia",
    "ops_rondas",
    "ops_pauta",
    "ops_supervision",
    "ops_inventario",
    "documentos",
    "payroll",
    "finanzas",
    "portal_cliente",
    "portal_supervisor",
    "portal_guardia",
    "gamificacion",
    "chat",
    "fiscalizacion",
  ],
  // Backward compatibility aliases
  trial: undefined as unknown as TenantModuleKey[],
  essential: undefined as unknown as TenantModuleKey[],
  professional: undefined as unknown as TenantModuleKey[],
};
// Wire aliases
PLAN_MODULES.trial = PLAN_MODULES.free;
PLAN_MODULES.essential = PLAN_MODULES.starter;
PLAN_MODULES.professional = PLAN_MODULES.profesional;
```

- [ ] **Step 2: Update provisionTenant plan type**

In `src/lib/tenant-provisioning.ts`, update the `CreateTenantInput` plan type:

```typescript
  plan: "free" | "starter" | "profesional" | "enterprise";
```

Keep backward compat — at the start of `provisionTenant`, normalize old names:

```typescript
  // Normalize legacy plan names
  const normalizedPlan = 
    plan === 'trial' ? 'free' :
    plan === 'essential' ? 'starter' :
    plan === 'professional' ? 'profesional' :
    plan;
```

Then use `normalizedPlan` everywhere instead of `plan`.

- [ ] **Step 3: Migrate existing data**

Run a one-time data migration:

```bash
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.tenantPlan.updateMany({ where: { plan: 'trial' }, data: { plan: 'free' } });
  await prisma.tenantPlan.updateMany({ where: { plan: 'essential' }, data: { plan: 'starter' } });
  await prisma.tenantPlan.updateMany({ where: { plan: 'professional' }, data: { plan: 'profesional' } });
  console.log('Done');
  await prisma.\$disconnect();
}
main();
"
```

- [ ] **Step 4: Update platform API routes that reference old plan names**

In `src/app/api/platform/tenants/[id]/plan/route.ts`, the PATCH handler should accept both old and new names and normalize:

```typescript
  // Normalize plan name
  if (body.plan) {
    const nameMap: Record<string, string> = { trial: 'free', essential: 'starter', professional: 'profesional' };
    data.plan = nameMap[body.plan] || body.plan;
  }
```

- [ ] **Step 5: Update CreateTenantForm select options**

In `src/components/platform/CreateTenantForm.tsx`, change the plan select options:

```tsx
<option value="free">Free</option>
<option value="starter">Starter</option>
<option value="profesional">Profesional</option>
<option value="enterprise">Enterprise</option>
```

And the type: `type Plan = 'free' | 'starter' | 'profesional' | 'enterprise';`
And default: `const [plan, setPlan] = useState<Plan>('free');`

- [ ] **Step 6: Update TenantTable badge colors for new plan names**

In `src/components/platform/TenantTable.tsx`, update the `planBadgeVariant` map:

```typescript
const planBadgeVariant: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  starter: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  profesional: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  enterprise: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  // Legacy
  trial: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  essential: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  professional: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/tenant-modules.ts src/lib/tenant-provisioning.ts src/components/platform/ src/app/api/platform/
git commit -m "feat: migrate plan slugs to free/starter/profesional/enterprise"
```

---

### Task 3: Seed pricing catalogs

**Files:**
- Create: `prisma/seeds/pricing-catalog-seed.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Create pricing catalog seed file**

Create `prisma/seeds/pricing-catalog-seed.ts` with the full seed data for plans, add-ons, and packs as defined in the spec. Use `upsert` by slug for idempotency.

The file should export `async function seedPricingCatalog(prisma: PrismaClient)`.

Plan seeds: free (0 UF, 10 guards), starter (0.5 UF/guard, 20 UF min, 200 guards), profesional (0.8 UF/guard, 45 UF min, 500 guards, featured), enterprise (custom, 9999 guards).

Addon seeds: 14 add-ons covering operational, commercial, financial, and premium categories.

Pack seeds: 4 packs with discount percentages.

- [ ] **Step 2: Import and call in seed.ts**

Add import at top of `prisma/seed.ts`:
```typescript
import { seedPricingCatalog } from './seeds/pricing-catalog-seed';
```

Add call before "Platform Admin" section:
```typescript
  // 15. Pricing Catalog (plans, addons, packs)
  await seedPricingCatalog(prisma);
```

- [ ] **Step 3: Run seed**

```bash
npx prisma db seed
```

- [ ] **Step 4: Commit**

```bash
git add prisma/seeds/pricing-catalog-seed.ts prisma/seed.ts
git commit -m "feat: seed pricing catalog (4 plans, 14 addons, 4 packs)"
```

---

### Task 4: Catalog API routes

**Files:**
- Create: `src/app/api/platform/catalog/plans/route.ts`
- Create: `src/app/api/platform/catalog/plans/[id]/route.ts`
- Create: `src/app/api/platform/catalog/addons/route.ts`
- Create: `src/app/api/platform/catalog/addons/[id]/route.ts`
- Create: `src/app/api/platform/catalog/packs/route.ts`
- Create: `src/app/api/platform/catalog/packs/[id]/route.ts`

- [ ] **Step 1: Create plans catalog routes**

GET returns all plans ordered by sortOrder. PATCH updates a specific plan by id.

- [ ] **Step 2: Create addons catalog routes**

GET returns all add-ons ordered by sortOrder. PATCH updates a specific add-on by id.

- [ ] **Step 3: Create packs catalog routes**

GET returns all packs. PATCH updates a specific pack by id.

All routes use `requirePlatformAuth()`. All PATCH routes accept partial updates.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platform/catalog/
git commit -m "feat: add catalog API routes for plans, addons, and packs"
```

---

### Task 5: Tenant add-ons API routes

**Files:**
- Create: `src/app/api/platform/tenants/[id]/addons/route.ts`
- Create: `src/app/api/platform/tenants/[id]/addons/pack/route.ts`

- [ ] **Step 1: Create tenant addons route**

- GET: Returns active add-ons with effective prices, available add-ons, and pack status.
- POST: Activates an add-on for the tenant. If addon has `moduleKey`, also enables the TenantModule. Body: `{ addonSlug, customPrice? }`
- DELETE: Deactivates an add-on. If addon has `moduleKey`, also disables the TenantModule. Uses query param `?addon=slug`.

- [ ] **Step 2: Create pack activation route**

POST `/api/platform/tenants/[id]/addons/pack` with body `{ packSlug }`:
- Finds the pack and its add-on slugs
- Activates all add-ons in the pack
- Sets `packId` on each TenantAddon
- Enables corresponding TenantModules

- [ ] **Step 3: Commit**

```bash
git add src/app/api/platform/tenants/*/addons/
git commit -m "feat: add tenant add-ons API (activate, deactivate, apply pack)"
```

---

### Task 6: Enhanced billing API

**Files:**
- Modify: `src/app/api/platform/billing/route.ts`

- [ ] **Step 1: Rewrite billing route with add-on formula**

The billing formula per tenant:

```
planPrice = max(effectivePricePerGuard × activeGuards, effectiveBaseMinimum)
  where effectivePricePerGuard = customPricePerGuard ?? catalogPricePerGuard ?? tenantPlan.pricePerGuard
  where effectiveBaseMinimum = customBaseMinimum ?? catalogBaseMinimum ?? tenantPlan.basePrice

addonPrices = for each active TenantAddon:
  - per_guard: effectivePrice × activeGuards
  - flat: effectivePrice
  - per_unit: effectivePrice × units (default to 1 for now)
  where effectivePrice = customPrice ?? catalog.priceAmount

packDiscount = if all addons of a pack are active:
  sum(addon prices in pack) × (discountPct / 100)

monthlyTotal = planPrice + sum(addonPrices) - packDiscount
```

Response adds per-tenant add-on breakdown, currency "UF", pack discounts.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform/billing/route.ts
git commit -m "feat: enhanced billing API with add-ons and pack discounts"
```

---

### Task 7: Pricing catalog page

**Files:**
- Modify: `src/app/platform/pricing/page.tsx` (replace placeholder)
- Create: `src/components/platform/PlanCatalogTable.tsx`
- Create: `src/components/platform/AddonCatalogTable.tsx`
- Create: `src/components/platform/PackCatalogCards.tsx`

- [ ] **Step 1: Create PlanCatalogTable**

Editable table showing all 4 plans: name, pricePerGuard (UF), baseMinimum (UF), maxGuards, maxAdmins, modules (chips), active toggle. Each field is inline-editable. Save button per row.

- [ ] **Step 2: Create AddonCatalogTable**

Editable table with 14 add-ons grouped by tag. Columns: name, pricing model, price (UF), unit, module key, active toggle. Inline editable.

- [ ] **Step 3: Create PackCatalogCards**

Card grid. Each card shows: pack name, included add-ons as chips, discount % (editable), active toggle.

- [ ] **Step 4: Create pricing page with 3 tabs**

```tsx
// Tabs: Planes | Add-ons | Packs
// Each tab renders the corresponding component
```

- [ ] **Step 5: Commit**

```bash
git add src/app/platform/pricing/ src/components/platform/PlanCatalogTable.tsx src/components/platform/AddonCatalogTable.tsx src/components/platform/PackCatalogCards.tsx
git commit -m "feat: add pricing catalog page with plans, addons, and packs management"
```

---

### Task 8: Tenant add-ons section in detail page

**Files:**
- Create: `src/components/platform/TenantAddonsSection.tsx`
- Modify: `src/components/platform/TenantDetailTabs.tsx`

- [ ] **Step 1: Create TenantAddonsSection**

This replaces the current plan/modules tab content. Sections:

1. **Plan section**: current plan badge, change plan buttons, editable custom price overrides (pricePerGuard, baseMinimum)
2. **Add-ons section**: all add-ons from catalog with toggle on/off, custom price field, "INCLUDED IN PLAN" badge for modules that come with the plan
3. **Packs section**: pack cards with "Apply" button, shows savings
4. **Billing summary**: real-time calculation showing plan price + each addon price - pack discount = total (UF/month)

Fetches data from:
- GET `/api/platform/tenants/[id]` (existing)
- GET `/api/platform/tenants/[id]/addons`
- GET `/api/platform/catalog/plans`
- GET `/api/platform/catalog/addons`
- GET `/api/platform/catalog/packs`

Mutations:
- PATCH `/api/platform/tenants/[id]/plan`
- POST/DELETE `/api/platform/tenants/[id]/addons`
- POST `/api/platform/tenants/[id]/addons/pack`

- [ ] **Step 2: Replace plan tab content in TenantDetailTabs**

In `TenantDetailTabs.tsx`, replace the `activeTab === 'plan'` content with `<TenantAddonsSection tenantId={tenantId} />`. Update the tab label from "Plan y Módulos" to "Plan y Add-ons".

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/TenantAddonsSection.tsx src/components/platform/TenantDetailTabs.tsx
git commit -m "feat: add tenant add-ons section with billing summary in detail page"
```

---

### Task 9: Enhanced billing page

**Files:**
- Modify: `src/app/platform/billing/page.tsx`

- [ ] **Step 1: Update billing page**

Update the billing page to show:
- Extra columns: Add-ons (UF), Descuentos (UF)
- Footer totals include add-on revenue
- Billing data now comes from the enhanced API with per-tenant add-on breakdown

Column order: Tenant | Plan | Guardias | Plan base (UF) | Add-ons (UF) | Descuentos (UF) | Total (UF)

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/billing/page.tsx
git commit -m "feat: enhanced billing page with add-on breakdown"
```

---

### Task 10: Verify full flow

- [ ] **Step 1: Run seed**

```bash
npx prisma db seed
```

Verify: 4 plans, 14 add-ons, 4 packs seeded.

- [ ] **Step 2: Test pricing catalog**

1. Go to `/platform/pricing`
2. Verify 3 tabs: Planes, Add-ons, Packs
3. Edit a plan price, verify save works
4. Toggle an add-on active/inactive

- [ ] **Step 3: Test tenant add-ons**

1. Go to tenant detail → Plan y Add-ons tab
2. Verify plan info shows
3. Toggle an add-on ON
4. Verify billing summary updates in real-time
5. Apply a pack, verify discounts appear

- [ ] **Step 4: Test billing page**

1. Go to `/platform/billing`
2. Verify add-on columns appear
3. Verify totals include add-ons
4. Export CSV

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: pricing catalog flow adjustments"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Schema: PlanCatalog, AddonCatalog, PackCatalog, TenantAddon + TenantPlan extension |
| 2 | Migrate plan slugs: trial→free, essential→starter, professional→profesional |
| 3 | Seed pricing catalogs (4 plans, 14 add-ons, 4 packs) |
| 4 | Catalog API routes (CRUD for plans, addons, packs) |
| 5 | Tenant add-ons API (activate, deactivate, apply pack) |
| 6 | Enhanced billing API with add-on formula |
| 7 | Pricing catalog page (3-tab management UI) |
| 8 | Tenant add-ons section in detail page with billing summary |
| 9 | Enhanced billing page with add-on breakdown |
| 10 | Verify full flow |
