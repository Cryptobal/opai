# Cashflow Architecture Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Flujo de Caja module from a static, isolated forecast into a dynamic, account-driven financial system that auto-reconciles with bank movements, absorbs variances in-line, and lets the user reschedule projected payments visually.

**Architecture:** Three sequential phases that each ship working software:
1. Anchor every cashflow category to one or more accounts in the existing chart of accounts (`FinanceAccountPlan`). 1:N via a join table.
2. Replace the brittle amount/date matcher with an account-driven matcher that reads `FinanceBankTransactionLink` and shows projected vs real with variance per cell.
3. Add a dynamic UX layer: drag-to-reschedule occurrences, quick-create modal from a cell, and re-projection on the fly.

**Tech Stack:** Next.js 16 App Router, Prisma 6, PostgreSQL (Neon), TypeScript, React. Schema changes via Prisma migrations. UI components in `src/components/finance/cashflow/*`. Core services in `src/modules/finance/cashflow/*`. Tests with Vitest in `__tests__` directories.

**Out of scope:** Modifying journal entries, generating accounting entries from cashflow, multi-currency consolidation beyond CLP/UF (already supported), permission model changes, refactoring other finance modules.

---

## File Structure

### Phase 1 — Categories ↔ Account Plan (1:N)

**New files:**
- `prisma/migrations/20260510000000_cashflow_category_account_join/migration.sql` — create join table
- `src/modules/finance/cashflow/categoryAccount.service.ts` — CRUD on the join
- `src/modules/finance/cashflow/category-account-defaults.ts` — system mapping (16 categories → cuenta contable code)
- `src/app/api/finance/cashflow/categorias/[id]/accounts/route.ts` — list/replace mapping for a category
- `src/components/finance/cashflow/CategoryAccountsEditor.tsx` — UI to add/remove account chips per category
- `src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts`
- `src/modules/finance/cashflow/__tests__/category-account-defaults.test.ts`

**Modified files:**
- `prisma/schema.prisma` — add `FinanceCashflowCategoryAccount` model
- `src/modules/finance/cashflow/category.service.ts` — `seedSystemCategoriesForTenant` also seeds account mappings
- `src/components/finance/cashflow/CashflowConfigClient.tsx` — render `CategoryAccountsEditor` inside each category row

### Phase 2 — Account-driven matcher with variance

**New files:**
- `src/modules/finance/cashflow/account-matcher.ts` — new primary matcher
- `src/modules/finance/cashflow/category-resolver.ts` — pure helper: `accountPlanId → categoryId`
- `src/modules/finance/cashflow/__tests__/account-matcher.test.ts`
- `src/modules/finance/cashflow/__tests__/category-resolver.test.ts`

**Modified files:**
- `src/modules/finance/cashflow/types.ts` — extend `VirtualOccurrence` and `ProjectionBucket` with `actualAmountClp` and `varianceClp`
- `src/modules/finance/cashflow/projection.service.ts` — compute and attach variance per occurrence/bucket; pull bank tx links into the projection
- `src/modules/finance/cashflow/actuals-matcher.ts` — keep as fallback only (legacy heuristic), but call `account-matcher.ts` first
- `src/components/finance/cashflow/MonthlyMatrix.tsx` and `WeeklyMatrix.tsx` — render real / variance under projected per cell
- `src/app/api/finance/cashflow/match/route.ts` — wire the new matcher

### Phase 3 — Dynamic forecast (drag & quick create)

**New files:**
- `src/app/api/finance/cashflow/occurrences/[id]/move/route.ts` — endpoint to reschedule
- `src/components/finance/cashflow/QuickItemModal.tsx` — minimal modal to create a recurring item from a cell
- `src/components/finance/cashflow/MatrixDnDProvider.tsx` — wraps `dnd-kit` context for the matrix
- `src/components/finance/cashflow/__tests__/QuickItemModal.test.tsx`

**Modified files:**
- `src/modules/finance/cashflow/occurrence.service.ts` — add `moveOccurrence(tenantId, id, newDate)`
- `src/components/finance/cashflow/CashflowTabs.tsx` — wrap matrices in `MatrixDnDProvider`, mount `QuickItemModal`
- `src/components/finance/cashflow/MonthlyMatrix.tsx` and `WeeklyMatrix.tsx` — make cells `DraggableOccurrence` and `DroppableCell`

---

# PHASE 1 — Categories ↔ Account Plan (1:N)

**Outcome of this phase:** Every cashflow category can be linked to one or more accounting accounts. The 16 system categories ship pre-mapped. The user can edit mappings from the configuration page.

### Task 1.1: Schema + migration for join table

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260510000000_cashflow_category_account_join/migration.sql`

- [ ] **Step 1: Add the join model to `prisma/schema.prisma` right after `FinanceCashflowCategory` (around line 7321)**

```prisma
/// Mapeo N:M entre categorías de flujo de caja y cuentas del plan de cuentas.
/// Una categoría puede agrupar varias cuentas contables; una cuenta puede
/// pertenecer a varias categorías (raro pero permitido para reglas especiales).
model FinanceCashflowCategoryAccount {
  id            String                   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId      String                   @map("tenant_id")
  categoryId    String                   @map("category_id") @db.Uuid
  category      FinanceCashflowCategory  @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  accountPlanId String                   @map("account_plan_id") @db.Uuid
  accountPlan   FinanceAccountPlan       @relation("CashflowCategoryAccountMap", fields: [accountPlanId], references: [id], onDelete: Cascade)
  isPrimary     Boolean                  @default(false) @map("is_primary")
  createdAt     DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([categoryId, accountPlanId], map: "uq_cashflow_cat_account")
  @@index([tenantId], map: "idx_cashflow_cat_account_tenant")
  @@index([accountPlanId], map: "idx_cashflow_cat_account_account")
  @@map("finance_cashflow_category_accounts")
  @@schema("finance")
}
```

- [ ] **Step 2: Add the inverse relations**

In `FinanceCashflowCategory` (line 7300), add inside the model:
```prisma
  accountMappings FinanceCashflowCategoryAccount[]
```

In `FinanceAccountPlan` (line 6041), add inside the model right after `cashflowCategories`:
```prisma
  cashflowCategoryAccounts FinanceCashflowCategoryAccount[] @relation("CashflowCategoryAccountMap")
```

- [ ] **Step 3: Create the migration SQL**

Write `prisma/migrations/20260510000000_cashflow_category_account_join/migration.sql`:
```sql
CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_category_accounts" (
  "id"               UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"        TEXT NOT NULL,
  "category_id"      UUID NOT NULL,
  "account_plan_id"  UUID NOT NULL,
  "is_primary"       BOOLEAN NOT NULL DEFAULT false,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_cashflow_category_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_cat_account"
  ON "finance"."finance_cashflow_category_accounts"("category_id", "account_plan_id");

CREATE INDEX IF NOT EXISTS "idx_cashflow_cat_account_tenant"
  ON "finance"."finance_cashflow_category_accounts"("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_cashflow_cat_account_account"
  ON "finance"."finance_cashflow_category_accounts"("account_plan_id");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_category_accounts"
    ADD CONSTRAINT "finance_cashflow_cat_account_category_fk"
    FOREIGN KEY ("category_id") REFERENCES "finance"."finance_cashflow_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_category_accounts"
    ADD CONSTRAINT "finance_cashflow_cat_account_account_fk"
    FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Apply the migration locally**

Run: `npx prisma migrate deploy`
Expected: `Applying migration 20260510000000_cashflow_category_account_join` and `All migrations have been successfully applied.`

- [ ] **Step 5: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260510000000_cashflow_category_account_join/
git commit -m "feat(finanzas/flujo-caja): tabla intermedia categoría ↔ cuenta contable (1:N)"
```

---

### Task 1.2: Default system mapping (16 categories → chart-of-accounts codes)

**Files:**
- Create: `src/modules/finance/cashflow/category-account-defaults.ts`
- Create: `src/modules/finance/cashflow/__tests__/category-account-defaults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/finance/cashflow/__tests__/category-account-defaults.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATEGORY_ACCOUNT_MAP,
  accountCodesForCategory,
} from "../category-account-defaults";

describe("category-account-defaults", () => {
  it("maps every system category to at least one account code", () => {
    const required = [
      "ING_VENTA_CONTRATO", "ING_TURNO_EXTRA", "ING_INSTALACION", "ING_OTRO",
      "EGR_SUELDO", "EGR_QUINCENA", "EGR_PREVIRED", "EGR_TURNO_EXTRA",
      "EGR_TELEFONIA", "EGR_ARRIENDO", "EGR_SERVICIOS", "EGR_PROVEEDOR",
      "EGR_IVA_F29", "EGR_IMPUESTO", "EGR_RETIRO_SOCIO", "EGR_OTRO",
    ];
    for (const code of required) {
      const accounts = accountCodesForCategory(code);
      expect(accounts.length, `category ${code}`).toBeGreaterThan(0);
    }
  });

  it("EGR_TELEFONIA maps to a Servicios Comunicaciones account", () => {
    const accounts = accountCodesForCategory("EGR_TELEFONIA");
    expect(accounts).toContain("4.2.03.005");
  });

  it("ING_VENTA_CONTRATO maps to Ingresos por servicios prestados", () => {
    expect(accountCodesForCategory("ING_VENTA_CONTRATO")).toContain("4.1.01.001");
  });

  it("returns empty array for unknown category code", () => {
    expect(accountCodesForCategory("UNKNOWN_CODE")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/category-account-defaults.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the defaults map**

Create `src/modules/finance/cashflow/category-account-defaults.ts`:
```typescript
/**
 * Mapeo por defecto entre las 16 categorías sistema del flujo de caja y los
 * códigos de cuenta del plan contable estándar Chile (ver
 * src/modules/finance/shared/constants/chart-of-accounts-cl.ts).
 *
 * El primer código de cada arreglo es la cuenta "principal" (isPrimary=true).
 * El resto son cuentas adicionales que también caen bajo esa categoría.
 *
 * Cuando el usuario hace conciliación bancaria contra una cuenta listada acá,
 * el cashflow puede asociar automáticamente el movimiento a la categoría
 * correspondiente.
 */
export const DEFAULT_CATEGORY_ACCOUNT_MAP: Record<string, string[]> = {
  // ─── Ingresos ───
  ING_VENTA_CONTRATO: ["4.1.01.001"],          // Ingresos por servicios prestados
  ING_TURNO_EXTRA:    ["4.1.01.002"],          // Servicios complementarios / turnos extra
  ING_INSTALACION:    ["4.1.01.003"],          // Cargos de instalación
  ING_OTRO:           ["4.1.02.001"],          // Otros ingresos operacionales

  // ─── Egresos: remuneraciones ───
  EGR_SUELDO:         ["4.2.01.001"],          // Sueldos y remuneraciones
  EGR_QUINCENA:       ["4.2.01.001"],          // (mismo, anticipo del mismo)
  EGR_PREVIRED:       ["4.2.01.005"],          // Cotizaciones previsionales
  EGR_TURNO_EXTRA:    ["4.2.01.002"],          // Horas extras / turnos extra

  // ─── Egresos: administrativos ───
  EGR_TELEFONIA:      ["4.2.03.005"],          // Servicios telecomunicaciones
  EGR_ARRIENDO:       ["4.2.03.001"],          // Arriendos
  EGR_SERVICIOS:      ["4.2.03.002", "4.2.03.003", "4.2.03.004"], // Luz, Agua, Gas
  EGR_PROVEEDOR:      ["4.2.03.099"],          // Otros gastos generales

  // ─── Egresos: tributarios ───
  EGR_IVA_F29:        ["2.1.02.001"],          // IVA débito fiscal
  EGR_IMPUESTO:       ["2.1.02.099"],          // Otros impuestos por pagar

  // ─── Egresos: socios / otros ───
  EGR_RETIRO_SOCIO:   ["3.2.01.001"],          // Cuenta corriente socios
  EGR_OTRO:           ["4.2.04.099"],          // Otros egresos no operacionales
};

/** Devuelve los códigos contables asociados a una categoría sistema. */
export function accountCodesForCategory(categoryCode: string): string[] {
  return DEFAULT_CATEGORY_ACCOUNT_MAP[categoryCode] ?? [];
}

/** Devuelve el código contable principal (primero del arreglo) o null. */
export function primaryAccountCodeForCategory(categoryCode: string): string | null {
  const codes = DEFAULT_CATEGORY_ACCOUNT_MAP[categoryCode];
  return codes && codes.length > 0 ? codes[0] : null;
}
```

- [ ] **Step 4: Verify the chart of accounts file has these codes**

Run: `grep -E "code: \"(4\\.1\\.01|4\\.2\\.01|4\\.2\\.03|4\\.2\\.04|2\\.1\\.02|3\\.2\\.01)" src/modules/finance/shared/constants/chart-of-accounts-cl.ts | head -25`

If any code from the map is missing, **stop and add it to** `src/modules/finance/shared/constants/chart-of-accounts-cl.ts`. Do not make up codes — verify each one exists. The seed will fail otherwise.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/category-account-defaults.test.ts`
Expected: 4/4 passing.

- [ ] **Step 6: Commit**

```bash
git add src/modules/finance/cashflow/category-account-defaults.ts src/modules/finance/cashflow/__tests__/category-account-defaults.test.ts
git commit -m "feat(finanzas/flujo-caja): mapeo por defecto categoría sistema → cuenta contable"
```

---

### Task 1.3: `categoryAccount.service.ts` (CRUD on the join)

**Files:**
- Create: `src/modules/finance/cashflow/categoryAccount.service.ts`
- Create: `src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listMappingsForCategory,
  setMappingsForCategory,
  resolveCategoryFromAccount,
} from "../categoryAccount.service";

const TENANT = "test-tenant-cashflow-cat-acc";

describe("categoryAccount.service", () => {
  beforeEach(async () => {
    await prisma.financeCashflowCategoryAccount.deleteMany({ where: { tenantId: TENANT } });
  });

  it("setMappingsForCategory replaces all mappings atomically", async () => {
    const cat = await prisma.financeCashflowCategory.findFirst({ where: { tenantId: TENANT } });
    if (!cat) return; // skip if no fixture
    const accs = await prisma.financeAccountPlan.findMany({ where: { tenantId: TENANT }, take: 3 });
    if (accs.length < 3) return;

    await setMappingsForCategory(TENANT, cat.id, [accs[0].id, accs[1].id]);
    let mappings = await listMappingsForCategory(TENANT, cat.id);
    expect(mappings.map((m) => m.accountPlanId).sort()).toEqual([accs[0].id, accs[1].id].sort());

    await setMappingsForCategory(TENANT, cat.id, [accs[2].id]);
    mappings = await listMappingsForCategory(TENANT, cat.id);
    expect(mappings.map((m) => m.accountPlanId)).toEqual([accs[2].id]);
  });

  it("resolveCategoryFromAccount returns the category with isPrimary mapping", async () => {
    const cat = await prisma.financeCashflowCategory.findFirst({ where: { tenantId: TENANT } });
    const acc = await prisma.financeAccountPlan.findFirst({ where: { tenantId: TENANT } });
    if (!cat || !acc) return;
    await setMappingsForCategory(TENANT, cat.id, [acc.id]);
    const found = await resolveCategoryFromAccount(TENANT, acc.id);
    expect(found?.id).toBe(cat.id);
  });

  it("resolveCategoryFromAccount returns null when no mapping", async () => {
    const found = await resolveCategoryFromAccount(TENANT, "00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the service**

Create `src/modules/finance/cashflow/categoryAccount.service.ts`:
```typescript
import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceCashflowCategoryAccount, FinanceCashflowCategory } from "@prisma/client";

export async function listMappingsForCategory(
  tenantId: string,
  categoryId: string,
): Promise<Array<FinanceCashflowCategoryAccount & { accountPlan: { code: string; name: string } }>> {
  return prisma.financeCashflowCategoryAccount.findMany({
    where: { tenantId, categoryId },
    include: { accountPlan: { select: { code: true, name: true } } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Reemplaza todos los mappings de una categoría por la lista entregada.
 * El primer accountPlanId del arreglo queda como `isPrimary=true`.
 */
export async function setMappingsForCategory(
  tenantId: string,
  categoryId: string,
  accountPlanIds: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.financeCashflowCategoryAccount.deleteMany({
      where: { tenantId, categoryId },
    });
    for (let i = 0; i < accountPlanIds.length; i++) {
      await tx.financeCashflowCategoryAccount.create({
        data: {
          tenantId,
          categoryId,
          accountPlanId: accountPlanIds[i],
          isPrimary: i === 0,
        },
      });
    }
  });
}

/**
 * Dada una cuenta contable, devuelve la categoría de cashflow que la agrupa.
 * Si más de una categoría mapea a la misma cuenta, prefiere la que la tenga
 * marcada como `isPrimary`.
 */
export async function resolveCategoryFromAccount(
  tenantId: string,
  accountPlanId: string,
): Promise<FinanceCashflowCategory | null> {
  const mapping = await prisma.financeCashflowCategoryAccount.findFirst({
    where: { tenantId, accountPlanId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { category: true },
  });
  return mapping?.category ?? null;
}

/**
 * Bulk: para una lista de accountPlanIds, devuelve un Map accountPlanId →
 * FinanceCashflowCategory. Optimizado para usar dentro del matcher.
 */
export async function bulkResolveCategoriesFromAccounts(
  tenantId: string,
  accountPlanIds: string[],
): Promise<Map<string, FinanceCashflowCategory>> {
  if (accountPlanIds.length === 0) return new Map();
  const mappings = await prisma.financeCashflowCategoryAccount.findMany({
    where: { tenantId, accountPlanId: { in: accountPlanIds } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { category: true },
  });
  const result = new Map<string, FinanceCashflowCategory>();
  for (const m of mappings) {
    if (!result.has(m.accountPlanId)) {
      result.set(m.accountPlanId, m.category);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts`
Expected: tests pass (or skip cleanly if no fixture data — that's fine for now).

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/cashflow/categoryAccount.service.ts src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts
git commit -m "feat(finanzas/flujo-caja): service para mapping categoría ↔ cuenta contable"
```

---

### Task 1.4: Auto-seed mappings when seeding system categories

**Files:**
- Modify: `src/modules/finance/cashflow/category.service.ts:35-43`

- [ ] **Step 1: Read the current `seedSystemCategoriesForTenant`**

Run: `sed -n '35,43p' src/modules/finance/cashflow/category.service.ts`
Confirm it currently only upserts the category rows, no account mappings.

- [ ] **Step 2: Update the seed to also link accounts**

Replace lines 35-43 of `src/modules/finance/cashflow/category.service.ts` with:
```typescript
export async function seedSystemCategoriesForTenant(tenantId: string): Promise<void> {
  const { DEFAULT_CATEGORY_ACCOUNT_MAP } = await import("./category-account-defaults");
  const { setMappingsForCategory } = await import("./categoryAccount.service");

  for (const c of SYSTEM_CATEGORIES) {
    const cat = await prisma.financeCashflowCategory.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: { name: c.name, sortOrder: c.sortOrder, color: c.color, isSystem: true, kind: c.kind },
      create: { tenantId, ...c, isSystem: true, isActive: true },
    });

    // Solo seed mappings si la categoría no tiene aún ninguno (preserva edits del usuario).
    const existingMappings = await prisma.financeCashflowCategoryAccount.count({
      where: { tenantId, categoryId: cat.id },
    });
    if (existingMappings > 0) continue;

    const codes = DEFAULT_CATEGORY_ACCOUNT_MAP[c.code];
    if (!codes || codes.length === 0) continue;

    const accounts = await prisma.financeAccountPlan.findMany({
      where: { tenantId, code: { in: codes } },
      select: { id: true, code: true },
    });
    // Mantener el orden definido en DEFAULT_CATEGORY_ACCOUNT_MAP
    const orderedIds = codes
      .map((code) => accounts.find((a) => a.code === code)?.id)
      .filter((id): id is string => !!id);
    if (orderedIds.length > 0) {
      await setMappingsForCategory(tenantId, cat.id, orderedIds);
    }
  }
}
```

The dynamic `import()` avoids a circular import between `category.service` and `categoryAccount.service`.

- [ ] **Step 3: Add a smoke test**

Append to `src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts`:
```typescript
it("seedSystemCategoriesForTenant attaches default account mappings", async () => {
  const { seedSystemCategoriesForTenant } = await import("../category.service");
  await seedSystemCategoriesForTenant(TENANT);
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId: TENANT, code: "EGR_TELEFONIA" },
  });
  if (!cat) return;
  const mappings = await listMappingsForCategory(TENANT, cat.id);
  expect(mappings.length).toBeGreaterThan(0);
  expect(mappings.some((m) => m.isPrimary)).toBe(true);
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/`
Expected: all green (or skipped cleanly if fixture data missing).

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/cashflow/category.service.ts src/modules/finance/cashflow/__tests__/categoryAccount.service.test.ts
git commit -m "feat(finanzas/flujo-caja): seed automático de mapping categoría → cuentas"
```

---

### Task 1.5: API endpoint to read/write mappings

**Files:**
- Create: `src/app/api/finance/cashflow/categorias/[id]/accounts/route.ts`

- [ ] **Step 1: Implement GET and PUT**

Create `src/app/api/finance/cashflow/categorias/[id]/accounts/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  listMappingsForCategory,
  setMappingsForCategory,
} from "@/modules/finance/cashflow/categoryAccount.service";
import { prisma } from "@/lib/prisma";

const setMappingsSchema = z.object({
  accountPlanIds: z.array(z.string().uuid()).max(50),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!cat) {
      return NextResponse.json({ success: false, error: "Categoría no encontrada" }, { status: 404 });
    }
    const mappings = await listMappingsForCategory(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: mappings });
  } catch (error) {
    console.error("[Finance/Cashflow] GET category accounts:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!cat) {
      return NextResponse.json({ success: false, error: "Categoría no encontrada" }, { status: 404 });
    }
    const parsed = await parseBody(request, setMappingsSchema);
    if (parsed.error) return parsed.error;

    // Validar que las cuentas pertenezcan al tenant
    const validAccounts = await prisma.financeAccountPlan.count({
      where: { tenantId: ctx.tenantId, id: { in: parsed.data.accountPlanIds } },
    });
    if (validAccounts !== parsed.data.accountPlanIds.length) {
      return NextResponse.json(
        { success: false, error: "Una o más cuentas no pertenecen al tenant" },
        { status: 400 },
      );
    }

    await setMappingsForCategory(ctx.tenantId, id, parsed.data.accountPlanIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Finance/Cashflow] PUT category accounts:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke-test manually**

Start dev server: `pnpm dev` (or `npm run dev`)
Run: `curl -s http://localhost:3000/api/finance/cashflow/categorias/<some-cat-id>/accounts -H "cookie: <session>"`
Expected: 200 with `{ success: true, data: [...] }` or 401 if cookie missing.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/finance/cashflow/categorias/\[id\]/accounts/
git commit -m "feat(finanzas/flujo-caja): endpoint GET/PUT mappings de categoría"
```

---

### Task 1.6: UI editor for category-account mappings

**Files:**
- Create: `src/components/finance/cashflow/CategoryAccountsEditor.tsx`
- Modify: `src/components/finance/cashflow/CashflowConfigClient.tsx`

- [ ] **Step 1: Create the editor component**

Create `src/components/finance/cashflow/CategoryAccountsEditor.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Mapping {
  id: string;
  accountPlanId: string;
  isPrimary: boolean;
  accountPlan: { code: string; name: string };
}

export function CategoryAccountsEditor({
  categoryId,
  accountOptions,
  canEdit,
}: {
  categoryId: string;
  accountOptions: AccountOption[];
  canEdit: boolean;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [picker, setPicker] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/finance/cashflow/categorias/${categoryId}/accounts`);
    const j = await r.json();
    if (j?.success) setMappings(j.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [categoryId]);

  async function save(nextIds: string[]) {
    setSaving(true);
    const r = await fetch(`/api/finance/cashflow/categorias/${categoryId}/accounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountPlanIds: nextIds }),
    });
    const j = await r.json();
    setSaving(false);
    if (j?.success) await load();
    else alert(j?.error ?? "Error al guardar");
  }

  function addAccount() {
    if (!picker) return;
    if (mappings.some((m) => m.accountPlanId === picker)) return;
    const nextIds = [...mappings.map((m) => m.accountPlanId), picker];
    save(nextIds);
    setPicker("");
  }

  function removeAccount(accountPlanId: string) {
    const nextIds = mappings
      .filter((m) => m.accountPlanId !== accountPlanId)
      .map((m) => m.accountPlanId);
    save(nextIds);
  }

  if (loading) return <span className="text-[12px] text-ds-text-3">Cargando cuentas…</span>;

  const available = accountOptions.filter(
    (o) => !mappings.some((m) => m.accountPlanId === o.id),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mappings.map((m) => (
        <span
          key={m.id}
          className={`inline-flex items-center gap-1 rounded-ds-sm px-1.5 py-0.5 text-[12px] ${
            m.isPrimary ? "bg-status-info-soft text-status-info-fg" : "bg-muted/40 text-ds-text-2"
          }`}
          title={m.accountPlan.name}
        >
          <span className="font-mono">{m.accountPlan.code}</span>
          {canEdit && (
            <button
              type="button"
              aria-label={`Quitar cuenta ${m.accountPlan.code}`}
              onClick={() => removeAccount(m.accountPlanId)}
              disabled={saving}
              className="hover:text-status-warn-fg"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit && available.length > 0 && (
        <div className="flex items-center gap-1">
          <Select value={picker} onValueChange={setPicker}>
            <SelectTrigger className="h-7 w-[200px] text-[12px]">
              <SelectValue placeholder="Agregar cuenta…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-[12px]">
                  <span className="font-mono mr-1">{a.code}</span> {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={addAccount}
            disabled={!picker || saving}
            className="h-7 px-2"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the config page**

In `src/components/finance/cashflow/CashflowConfigClient.tsx`:

1. Add an `accountOptions` prop:
```tsx
interface Props {
  initialConfig: CashflowConfig;
  initialCategories: Category[];
  accountOptions: { id: string; code: string; name: string }[];
}

export function CashflowConfigClient({ initialConfig, initialCategories, accountOptions }: Props) {
```

2. Add a new column in the categories table (right after the "Tipo" column, before "Sistema"):
```tsx
<th className="text-left p-2">Cuentas contables</th>
```

3. Render the editor in each row's cell:
```tsx
<td className="p-2">
  <CategoryAccountsEditor
    categoryId={c.id}
    accountOptions={accountOptions}
    canEdit={!c.isSystem || true}
  />
</td>
```

4. Import the component at the top:
```tsx
import { CategoryAccountsEditor } from "./CategoryAccountsEditor";
```

- [ ] **Step 3: Pass `accountOptions` from the server page**

In `src/app/(app)/opai/configuracion/finanzas/flujo-caja/page.tsx`, after the `Promise.all` for config and categories, add:
```tsx
const accountOptions = await prisma.financeAccountPlan.findMany({
  where: { tenantId, isActive: true, acceptsEntries: true },
  select: { id: true, code: true, name: true },
  orderBy: { code: "asc" },
});
```

And pass it to the client:
```tsx
<CashflowConfigClient
  initialConfig={JSON.parse(JSON.stringify(config))}
  initialCategories={JSON.parse(JSON.stringify(categories))}
  accountOptions={accountOptions}
/>
```

Add `import { prisma } from "@/lib/prisma";` at top if missing.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`
Open: `http://localhost:3000/opai/configuracion/finanzas/flujo-caja`
Expected: Categories table shows a "Cuentas contables" column with chips. Adding/removing a chip persists across reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/cashflow/CategoryAccountsEditor.tsx src/components/finance/cashflow/CashflowConfigClient.tsx 'src/app/(app)/opai/configuracion/finanzas/flujo-caja/page.tsx'
git commit -m "feat(finanzas/flujo-caja): UI para editar mapping categoría → cuentas (chips)"
```

---

### Task 1.7: Phase 1 verification & integration check

- [ ] **Step 1: Typecheck and tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "(cashflow|category-account)"`
Expected: empty (no errors in our files).

Run: `npx vitest run src/modules/finance/cashflow/__tests__/`
Expected: all green.

- [ ] **Step 2: Quick smoke test in app**

Run: `pnpm dev`
Open `/opai/configuracion/finanzas/flujo-caja` and confirm:
- All 16 system categories show with at least one chip pre-loaded.
- Adding a chip persists; removing a chip persists.
- Empty mapping is allowed (chip set may be empty after removing all).

- [ ] **Step 3: Push**

```bash
git push origin main
```

**Phase 1 done.** The schema, service, API and UI for 1:N category↔account mapping are live. No matching logic uses it yet — that's Phase 2.

---

# PHASE 2 — Account-driven matcher with variance

**Outcome of this phase:** When a bank transaction is reconciled to a DTE / payroll / direct expense (via existing `FinanceBankTransactionLink`), the cashflow projection picks up that movement, finds the matching projected occurrence by category+date window, marks it PAID, and shows variance (real vs projected) per cell. Heuristic amount/date matching becomes a fallback only.

**Pre-requisites:** Phase 1 complete and deployed.

### Task 2.1: `category-resolver.ts` (pure helper)

**Files:**
- Create: `src/modules/finance/cashflow/category-resolver.ts`
- Create: `src/modules/finance/cashflow/__tests__/category-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/finance/cashflow/__tests__/category-resolver.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { resolveCategoryForLink } from "../category-resolver";
import type { LinkContext } from "../category-resolver";

describe("resolveCategoryForLink", () => {
  it("returns categoryId from accountPlanId when present", () => {
    const ctx: LinkContext = {
      targetType: "EXPENSE",
      accountPlanId: "acc-1",
      dteAccountIds: [],
      accountToCategory: new Map([["acc-1", { id: "cat-1", code: "EGR_TELEFONIA", name: "Telefonía" } as any]]),
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-1");
  });

  it("falls back to DTE line accounts for DTE_RECEIVED", () => {
    const ctx: LinkContext = {
      targetType: "DTE_RECEIVED",
      accountPlanId: null,
      dteAccountIds: ["acc-2"],
      accountToCategory: new Map([["acc-2", { id: "cat-2", code: "EGR_PROVEEDOR", name: "Proveedores" } as any]]),
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-2");
  });

  it("returns null when no mapping exists", () => {
    const ctx: LinkContext = {
      targetType: "EXPENSE",
      accountPlanId: "acc-orphan",
      dteAccountIds: [],
      accountToCategory: new Map(),
    };
    expect(resolveCategoryForLink(ctx)).toBeNull();
  });

  it("payroll links resolve to EGR_SUELDO category by convention", () => {
    const ctx: LinkContext = {
      targetType: "PAYROLL_LIQUIDACION",
      accountPlanId: null,
      dteAccountIds: [],
      accountToCategory: new Map(),
      payrollSueldoCategoryId: "cat-sueldo",
    };
    const result = resolveCategoryForLink(ctx);
    expect(result?.id).toBe("cat-sueldo");
  });
});
```

- [ ] **Step 2: Implement the resolver**

Create `src/modules/finance/cashflow/category-resolver.ts`:
```typescript
import type { FinanceCashflowCategory, FinanceLinkTarget } from "@prisma/client";

export interface LinkContext {
  targetType: FinanceLinkTarget;
  /** accountPlanId atado al Link directamente (cuando es EXPENSE/INCOME). */
  accountPlanId: string | null;
  /** Si es DTE_ISSUED/DTE_RECEIVED, los account ids de las líneas del DTE. */
  dteAccountIds: string[];
  /** Mapa precomputado accountPlanId → categoría (de bulkResolveCategoriesFromAccounts). */
  accountToCategory: Map<string, FinanceCashflowCategory>;
  /** Atajo: id de la categoría EGR_SUELDO (resuelta por código una vez por request). */
  payrollSueldoCategoryId?: string | null;
  /** Atajo: id de la categoría EGR_TURNO_EXTRA. */
  payrollTurnoExtraCategoryId?: string | null;
  /** Atajo: id de la categoría EGR_QUINCENA. */
  payrollAnticipoCategoryId?: string | null;
}

/**
 * Dado un `FinanceBankTransactionLink`, resuelve a qué categoría de flujo
 * de caja pertenece. Orden de precedencia:
 *
 * 1. PAYROLL_LIQUIDACION → EGR_SUELDO (convención)
 *    PAYROLL_ANTICIPO    → EGR_QUINCENA
 *    TE_LOTE             → EGR_TURNO_EXTRA
 * 2. accountPlanId del link (EXPENSE/INCOME directo) → mapping
 * 3. accounts de líneas del DTE (DTE_ISSUED/DTE_RECEIVED) → primera categoría que matchee
 *
 * Devuelve null si no se puede resolver.
 */
export function resolveCategoryForLink(ctx: LinkContext): FinanceCashflowCategory | null {
  switch (ctx.targetType) {
    case "PAYROLL_LIQUIDACION":
      if (ctx.payrollSueldoCategoryId) {
        return { id: ctx.payrollSueldoCategoryId } as FinanceCashflowCategory;
      }
      break;
    case "PAYROLL_ANTICIPO":
      if (ctx.payrollAnticipoCategoryId) {
        return { id: ctx.payrollAnticipoCategoryId } as FinanceCashflowCategory;
      }
      break;
    case "TE_LOTE":
      if (ctx.payrollTurnoExtraCategoryId) {
        return { id: ctx.payrollTurnoExtraCategoryId } as FinanceCashflowCategory;
      }
      break;
  }

  if (ctx.accountPlanId) {
    const cat = ctx.accountToCategory.get(ctx.accountPlanId);
    if (cat) return cat;
  }

  for (const accId of ctx.dteAccountIds) {
    const cat = ctx.accountToCategory.get(accId);
    if (cat) return cat;
  }

  return null;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/category-resolver.test.ts`
Expected: 4/4 passing.

- [ ] **Step 4: Commit**

```bash
git add src/modules/finance/cashflow/category-resolver.ts src/modules/finance/cashflow/__tests__/category-resolver.test.ts
git commit -m "feat(finanzas/flujo-caja): resolver categoría desde un BankTransactionLink"
```

---

### Task 2.2: Extend types with variance fields

**Files:**
- Modify: `src/modules/finance/cashflow/types.ts`

- [ ] **Step 1: Extend `VirtualOccurrence`**

In `src/modules/finance/cashflow/types.ts`, replace the `VirtualOccurrence` interface with:
```typescript
export interface VirtualOccurrence {
  id: string | null;
  itemId: string | null;
  source: FinanceCashflowItemSource;
  categoryId: string | null;
  categoryCode: string;
  categoryName: string;
  kind: FinanceCashflowItemKind;
  name: string;
  description: string | null;
  scheduledDate: Date;
  effectiveDate: Date | null;
  amountClp: number;
  amountOriginal: number;
  currency: string;
  ufValueUsed: number | null;
  status: FinanceCashflowOccurrenceStatus;
  installationId: string | null;
  installationName: string | null;
  bankTransactionId: string | null;
  isVirtual: boolean;
  isAutoGenerated: boolean;
  /** Monto realmente ejecutado en banco (cuando hay match). */
  actualAmountClp: number | null;
  /** Diferencia real − proyectado (positivo si gastaste más / cobraste más). */
  varianceClp: number | null;
}
```

- [ ] **Step 2: Extend `ProjectionBucket`**

Replace `ProjectionBucket` with:
```typescript
export interface ProjectionBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  income: number;
  expense: number;
  net: number;
  /** Suma de `actualAmountClp` para occurrences PAID dentro del bucket. */
  actualIncome: number;
  actualExpense: number;
  /** real − proyectado para todo el bucket. */
  varianceClp: number;
  occurrences: VirtualOccurrence[];
}
```

- [ ] **Step 3: Extend `ProjectionMatrix`**

Replace `ProjectionMatrix` with:
```typescript
export interface ProjectionMatrix {
  range: ProjectionRange;
  buckets: ProjectionBucket[];
  rows: ProjectionRow[];
  totals: {
    totalIncome: number;
    totalExpense: number;
    totalNet: number;
    totalActualIncome: number;
    totalActualExpense: number;
    totalVariance: number;
  };
  openingBalanceClp: number;
  cumulativeBalances: { bucketKey: string; balanceClp: number }[];
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "cashflow" | head`
Expected: errors point to `projection.service.ts` and matrix components — those will be fixed in subsequent tasks. Don't fix them now.

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/cashflow/types.ts
git commit -m "feat(finanzas/flujo-caja): tipos extendidos con varianza (real vs proyectado)"
```

---

### Task 2.3: New `account-matcher.ts`

**Files:**
- Create: `src/modules/finance/cashflow/account-matcher.ts`
- Create: `src/modules/finance/cashflow/__tests__/account-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/finance/cashflow/__tests__/account-matcher.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { matchOccurrencesToBankLinks } from "../account-matcher";
import type { VirtualOccurrence } from "../types";

describe("matchOccurrencesToBankLinks", () => {
  it("matches an occurrence to a bank link sharing the same category and date window", async () => {
    const occ: VirtualOccurrence = {
      id: null,
      itemId: "item-1",
      source: "MANUAL",
      categoryId: "cat-tel",
      categoryCode: "EGR_TELEFONIA",
      categoryName: "Telefonía",
      kind: "EXPENSE",
      name: "Movistar",
      description: null,
      scheduledDate: new Date("2026-05-05"),
      effectiveDate: null,
      amountClp: 200_000,
      amountOriginal: 200_000,
      currency: "CLP",
      ufValueUsed: null,
      status: "PROJECTED",
      installationId: null,
      installationName: null,
      bankTransactionId: null,
      isVirtual: true,
      isAutoGenerated: false,
      actualAmountClp: null,
      varianceClp: null,
    };
    const link = {
      bankTransactionId: "tx-1",
      transactionDate: new Date("2026-05-07"),
      amountClp: 220_000,
      categoryId: "cat-tel",
    };
    const result = await matchOccurrencesToBankLinks([occ], [link], { matchDaysTolerance: 5 });
    expect(result.length).toBe(1);
    expect(result[0].status).toBe("PAID");
    expect(result[0].actualAmountClp).toBe(220_000);
    expect(result[0].varianceClp).toBe(20_000);
    expect(result[0].bankTransactionId).toBe("tx-1");
  });

  it("does NOT match when categories differ", async () => {
    const occ: VirtualOccurrence = {
      ...({} as VirtualOccurrence),
      categoryId: "cat-A",
      kind: "EXPENSE",
      scheduledDate: new Date("2026-05-05"),
      amountClp: 100_000,
      status: "PROJECTED",
      itemId: "item-1",
      bankTransactionId: null,
    };
    const link = {
      bankTransactionId: "tx-1",
      transactionDate: new Date("2026-05-05"),
      amountClp: 100_000,
      categoryId: "cat-B",
    };
    const result = await matchOccurrencesToBankLinks([occ], [link], { matchDaysTolerance: 5 });
    expect(result.length).toBe(0);
  });

  it("respects date tolerance window", async () => {
    const occ: VirtualOccurrence = {
      ...({} as VirtualOccurrence),
      categoryId: "cat-tel",
      kind: "EXPENSE",
      scheduledDate: new Date("2026-05-05"),
      amountClp: 200_000,
      status: "PROJECTED",
      itemId: "item-1",
      bankTransactionId: null,
    };
    const link = {
      bankTransactionId: "tx-1",
      transactionDate: new Date("2026-05-25"), // 20 days off
      amountClp: 200_000,
      categoryId: "cat-tel",
    };
    const result = await matchOccurrencesToBankLinks([occ], [link], { matchDaysTolerance: 5 });
    expect(result.length).toBe(0);
  });

  it("prefers the occurrence with smallest date diff when multiple match", async () => {
    const occA = {
      ...({} as VirtualOccurrence),
      itemId: "A",
      categoryId: "cat-tel",
      kind: "EXPENSE",
      scheduledDate: new Date("2026-05-01"),
      amountClp: 100_000,
      status: "PROJECTED",
      bankTransactionId: null,
    };
    const occB = {
      ...({} as VirtualOccurrence),
      itemId: "B",
      categoryId: "cat-tel",
      kind: "EXPENSE",
      scheduledDate: new Date("2026-05-06"),
      amountClp: 100_000,
      status: "PROJECTED",
      bankTransactionId: null,
    };
    const link = {
      bankTransactionId: "tx-1",
      transactionDate: new Date("2026-05-05"),
      amountClp: 100_000,
      categoryId: "cat-tel",
    };
    const result = await matchOccurrencesToBankLinks([occA, occB], [link], { matchDaysTolerance: 30 });
    expect(result.length).toBe(1);
    expect(result[0].itemId).toBe("B");
  });
});
```

- [ ] **Step 2: Implement the matcher**

Create `src/modules/finance/cashflow/account-matcher.ts`:
```typescript
import "server-only";
import { differenceInDays } from "date-fns";
import type { VirtualOccurrence } from "./types";

export interface BankLinkSlim {
  bankTransactionId: string;
  transactionDate: Date;
  /** Monto en CLP positivo (siempre absoluto, ya signed-correct para la categoría). */
  amountClp: number;
  /** categoryId resuelto desde el accountPlanId del link / DTE / convención de payroll. */
  categoryId: string;
}

/**
 * Matcher account-driven. Para cada link bancario ya conciliado contra una
 * cuenta contable, busca la ocurrencia proyectada con la misma categoría
 * dentro de la ventana de tolerancia de días, y la marca PAID con varianza.
 *
 * NO escribe a la DB — solo retorna las ocurrencias actualizadas. El caller
 * decide si las persiste (en projection.service durante render) o las
 * commitea (en /api/finance/cashflow/match POST).
 */
export async function matchOccurrencesToBankLinks(
  occurrences: VirtualOccurrence[],
  links: BankLinkSlim[],
  config: { matchDaysTolerance: number },
): Promise<VirtualOccurrence[]> {
  const usedLinkIds = new Set<string>();
  const updated: VirtualOccurrence[] = [];

  // Sort links by date ascending so deterministic
  const sortedLinks = [...links].sort((a, b) =>
    a.transactionDate.getTime() - b.transactionDate.getTime(),
  );

  for (const link of sortedLinks) {
    if (usedLinkIds.has(link.bankTransactionId)) continue;

    let best: { occ: VirtualOccurrence; daysDiff: number } | null = null;

    for (const occ of occurrences) {
      if (occ.bankTransactionId) continue;
      if (occ.status !== "PROJECTED") continue;
      if (occ.itemId === null) continue; // virtual/auto-generated, no item to update
      if (occ.categoryId !== link.categoryId) continue;

      const daysDiff = Math.abs(differenceInDays(link.transactionDate, occ.scheduledDate));
      if (daysDiff > config.matchDaysTolerance) continue;

      if (!best || daysDiff < best.daysDiff) {
        best = { occ, daysDiff };
      }
    }

    if (best) {
      const variance = link.amountClp - best.occ.amountClp;
      updated.push({
        ...best.occ,
        status: "PAID",
        bankTransactionId: link.bankTransactionId,
        actualAmountClp: link.amountClp,
        varianceClp: variance,
        effectiveDate: link.transactionDate,
      });
      usedLinkIds.add(link.bankTransactionId);
    }
  }

  return updated;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/account-matcher.test.ts`
Expected: 4/4 passing.

- [ ] **Step 4: Commit**

```bash
git add src/modules/finance/cashflow/account-matcher.ts src/modules/finance/cashflow/__tests__/account-matcher.test.ts
git commit -m "feat(finanzas/flujo-caja): matcher account-driven con varianza"
```

---

### Task 2.4: Wire matcher into `projection.service.ts`

**Files:**
- Modify: `src/modules/finance/cashflow/projection.service.ts`

- [ ] **Step 1: Add a helper to load bank links + resolve categories**

Add to the top of `src/modules/finance/cashflow/projection.service.ts` (after imports, before `buildProjection`):
```typescript
import { matchOccurrencesToBankLinks, type BankLinkSlim } from "./account-matcher";
import { resolveCategoryForLink } from "./category-resolver";
import { bulkResolveCategoriesFromAccounts } from "./categoryAccount.service";

async function loadResolvedBankLinks(
  tenantId: string,
  range: ProjectionRange,
  categoryByCode: Map<string, CategoryLite>,
): Promise<BankLinkSlim[]> {
  const links = await prisma.financeBankTransactionLink.findMany({
    where: {
      tenantId,
      bankTransaction: {
        transactionDate: { gte: range.from, lte: range.to },
        hiddenAt: null,
      },
    },
    select: {
      id: true,
      bankTransactionId: true,
      targetType: true,
      targetId: true,
      amount: true,
      accountPlanId: true,
      bankTransaction: { select: { transactionDate: true } },
    },
  });

  // Recolectar todos los account ids relevantes (links directos + DTE lines)
  const directAccountIds = new Set<string>();
  for (const l of links) if (l.accountPlanId) directAccountIds.add(l.accountPlanId);

  const dteIds = links
    .filter((l) => (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") && l.targetId)
    .map((l) => l.targetId!) as string[];

  const dteLines = dteIds.length > 0
    ? await prisma.financeDteLine.findMany({
        where: { dteId: { in: dteIds } },
        select: { dteId: true, accountId: true },
      })
    : [];
  for (const dl of dteLines) if (dl.accountId) directAccountIds.add(dl.accountId);

  const accountToCategory = await bulkResolveCategoriesFromAccounts(
    tenantId,
    Array.from(directAccountIds),
  );

  // Atajos para payroll / TE — resolver una vez por request
  const sueldoCat = categoryByCode.get("EGR_SUELDO");
  const turnoExtraCat = categoryByCode.get("EGR_TURNO_EXTRA");
  const anticipoCat = categoryByCode.get("EGR_QUINCENA");

  const resolved: BankLinkSlim[] = [];
  for (const l of links) {
    const dteAccountIds = (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") && l.targetId
      ? dteLines.filter((dl) => dl.dteId === l.targetId && dl.accountId).map((dl) => dl.accountId!)
      : [];
    const cat = resolveCategoryForLink({
      targetType: l.targetType,
      accountPlanId: l.accountPlanId,
      dteAccountIds,
      accountToCategory,
      payrollSueldoCategoryId: sueldoCat?.id ?? null,
      payrollTurnoExtraCategoryId: turnoExtraCat?.id ?? null,
      payrollAnticipoCategoryId: anticipoCat?.id ?? null,
    });
    if (!cat) continue;
    resolved.push({
      bankTransactionId: l.bankTransactionId,
      transactionDate: l.bankTransaction.transactionDate,
      amountClp: Math.abs(Number(l.amount)),
      categoryId: cat.id,
    });
  }
  return resolved;
}
```

Note: the `CategoryLite` type already exists at the top of the file.

- [ ] **Step 2: Apply matcher to occurrences in `buildProjection`**

In `buildProjection`, after the line `const allOccurrences: VirtualOccurrence[] = [];` is fully populated (around line 120, just before `const buckets = buildBuckets(range);`), add:
```typescript
// Inicializar campos de varianza en todas las ocurrencias
for (const occ of allOccurrences) {
  occ.actualAmountClp = null;
  occ.varianceClp = null;
}

// Aplicar matcher account-driven
const bankLinks = await loadResolvedBankLinks(tenantId, range, codeToCategory);
const matched = await matchOccurrencesToBankLinks(allOccurrences, bankLinks, {
  matchDaysTolerance: config.matchDaysTolerance,
});

// Mergear actualizaciones de matched de vuelta en allOccurrences
const matchedByItemDate = new Map<string, VirtualOccurrence>();
for (const m of matched) {
  if (m.itemId) {
    matchedByItemDate.set(`${m.itemId}|${m.scheduledDate.toISOString().slice(0, 10)}`, m);
  }
}
for (let i = 0; i < allOccurrences.length; i++) {
  const occ = allOccurrences[i];
  if (!occ.itemId) continue;
  const key = `${occ.itemId}|${occ.scheduledDate.toISOString().slice(0, 10)}`;
  const m = matchedByItemDate.get(key);
  if (m) allOccurrences[i] = m;
}
```

- [ ] **Step 3: Compute `actualIncome`/`actualExpense` per bucket**

In the loop that computes bucket aggregates (currently around line 125-135), replace:
```typescript
for (const occ of allOccurrences) {
  const key = bucketKeyFor(occ.scheduledDate, range.granularity);
  const idx = bucketIndex.get(key);
  if (idx === undefined) continue;
  const b = buckets[idx];
  if (occ.kind === "INCOME") b.income += occ.amountClp;
  else b.expense += occ.amountClp;
  b.net = b.income - b.expense;
  b.occurrences.push(occ);
}
```

with:
```typescript
for (const occ of allOccurrences) {
  const key = bucketKeyFor(occ.scheduledDate, range.granularity);
  const idx = bucketIndex.get(key);
  if (idx === undefined) continue;
  const b = buckets[idx];
  if (occ.kind === "INCOME") {
    b.income += occ.amountClp;
    if (occ.actualAmountClp !== null) b.actualIncome += occ.actualAmountClp;
  } else {
    b.expense += occ.amountClp;
    if (occ.actualAmountClp !== null) b.actualExpense += occ.actualAmountClp;
  }
  b.net = b.income - b.expense;
  b.varianceClp = (b.actualIncome - b.income) - (b.actualExpense - b.expense);
  b.occurrences.push(occ);
}
```

- [ ] **Step 4: Initialize new bucket fields in `buildBuckets`**

In `buildBuckets` (around line 160-170), update the `buckets.push` call to include the new fields:
```typescript
buckets.push({
  key: k,
  label,
  start,
  end,
  income: 0,
  expense: 0,
  net: 0,
  actualIncome: 0,
  actualExpense: 0,
  varianceClp: 0,
  occurrences: [],
});
```

- [ ] **Step 5: Update final return totals**

Replace the `totals` object in the return statement of `buildProjection`:
```typescript
totals: {
  totalIncome: buckets.reduce((s, b) => s + b.income, 0),
  totalExpense: buckets.reduce((s, b) => s + b.expense, 0),
  totalNet: buckets.reduce((s, b) => s + b.net, 0),
  totalActualIncome: buckets.reduce((s, b) => s + b.actualIncome, 0),
  totalActualExpense: buckets.reduce((s, b) => s + b.actualExpense, 0),
  totalVariance: buckets.reduce((s, b) => s + b.varianceClp, 0),
},
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "(projection.service|account-matcher|category-resolver)"`
Expected: empty.

- [ ] **Step 7: Commit**

```bash
git add src/modules/finance/cashflow/projection.service.ts
git commit -m "feat(finanzas/flujo-caja): integrar matcher account-driven en buildProjection"
```

---

### Task 2.5: Render variance in matrix UI

**Files:**
- Modify: `src/components/finance/cashflow/MonthlyMatrix.tsx`
- Modify: `src/components/finance/cashflow/WeeklyMatrix.tsx`

- [ ] **Step 1: Read current cell rendering in `MonthlyMatrix.tsx`**

Run: `sed -n '1,50p' src/components/finance/cashflow/MonthlyMatrix.tsx`
Identify how a row's `values[i].amount` is rendered.

- [ ] **Step 2: Update cell render**

Find the JSX that renders a numeric value per bucket. Locate the `td` (or div) that prints `fmt.format(value)`. Wrap it so it shows projected, actual (if any), and variance.

A self-contained helper (paste into `MonthlyMatrix.tsx` and `WeeklyMatrix.tsx`):
```tsx
function CellAmount({
  projected,
  actual,
  variance,
  kind,
}: {
  projected: number;
  actual: number | null;
  variance: number | null;
  kind: "INCOME" | "EXPENSE";
}) {
  const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  if (actual === null) {
    return <span className="font-mono text-[12px]">{fmt.format(projected)}</span>;
  }
  const tone = variance === null || variance === 0
    ? "text-ds-text-2"
    : (kind === "EXPENSE" ? variance > 0 : variance < 0)
      ? "text-status-warn-fg"
      : "text-status-ok-fg";
  return (
    <div className="leading-tight">
      <div className="font-mono text-[12px] line-through opacity-50">{fmt.format(projected)}</div>
      <div className="font-mono text-[12px] font-semibold">{fmt.format(actual)}</div>
      {variance !== null && variance !== 0 && (
        <div className={`font-mono text-[11px] ${tone}`}>
          {variance > 0 ? "+" : ""}{fmt.format(variance)}
        </div>
      )}
    </div>
  );
}
```

To compute `actual`/`variance` per cell, the matrices need access to the bucket-level `actualIncome`/`actualExpense`. Adapt the row-rendering code:

The current `ProjectionRow.values[i].amount` is the projected per (category, bucket). We need real per (category, bucket). Add this computed map right before rendering the rows in each matrix component:
```tsx
// Compute actual per (categoryId, bucketKey) from bucket.occurrences
const actualByCellKey = new Map<string, number>();
for (const b of buckets) {
  for (const occ of b.occurrences) {
    if (occ.actualAmountClp === null) continue;
    const cellKey = `${occ.categoryId ?? "_"}_${b.key}`;
    actualByCellKey.set(cellKey, (actualByCellKey.get(cellKey) ?? 0) + occ.actualAmountClp);
  }
}
```

Replace the cell render with `<CellAmount projected={v.amount} actual={actualByCellKey.get(\`${row.categoryId ?? "_"}_${v.bucketKey}\`) ?? null} variance={...} kind={row.kind} />`.

**Note for the engineer:** there's specific wiring depending on how each matrix iterates buckets. If you can't isolate `buckets` in the component (it might be passed as a different prop), accept the variance/actual as additional props from the parent (`CashflowTabs.tsx`) which already has the full `ProjectionMatrix`. Pass:
```tsx
<MonthlyMatrix matrix={matrix} actualByCellKey={actualByCellKey} />
```

Pre-compute `actualByCellKey` once in `CashflowTabs.tsx` before rendering any matrix.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`
Open `/finanzas/flujo-caja`. Verify cells with no real movement show only one number; cells with a matched bank transaction show projected (strikethrough), actual (bold) and variance (small, colored). Negative variance for expenses (paid less than projected) is green; positive (overspent) is amber.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/cashflow/MonthlyMatrix.tsx src/components/finance/cashflow/WeeklyMatrix.tsx src/components/finance/cashflow/CashflowTabs.tsx
git commit -m "feat(finanzas/flujo-caja): mostrar real/varianza por celda en matriz"
```

---

### Task 2.6: Make legacy matcher fallback-only

**Files:**
- Modify: `src/modules/finance/cashflow/actuals-matcher.ts`
- Modify: `src/app/api/finance/cashflow/match/route.ts`

- [ ] **Step 1: Read the match route**

Run: `cat src/app/api/finance/cashflow/match/route.ts`
Note that today it calls `autoMatchOccurrencesToBankTx`. We want it to first call `matchOccurrencesToBankLinks` (account-driven) and only run the legacy heuristic for occurrences without itemId mappings.

- [ ] **Step 2: Update the match route**

Replace the body of the POST handler in `src/app/api/finance/cashflow/match/route.ts` so that:
1. It loads the projection (which already runs the account matcher and persists matches via `upsertOccurrence` if you wire it).
2. Falls back to the legacy heuristic only on occurrences that ended up still PROJECTED with no `actualAmountClp`.

Concrete code:
```typescript
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { upsertOccurrence } from "@/modules/finance/cashflow/occurrence.service";
import { autoMatchOccurrencesToBankTx } from "@/modules/finance/cashflow/actuals-matcher";

export async function POST(request: NextRequest) {
  // ... auth boilerplate identical to current ...

  const projection = await buildProjection(ctx.tenantId, {
    from: parsed.data.from,
    to: parsed.data.to,
    granularity: "weekly",
  });

  // Persistir los matches que el account-matcher ya resolvió (status=PAID
  // con bankTransactionId). El account matcher no escribe a DB en su versión
  // pura — acá lo materializamos.
  let accountMatched = 0;
  for (const b of projection.buckets) {
    for (const occ of b.occurrences) {
      if (
        occ.status === "PAID" &&
        occ.bankTransactionId &&
        occ.itemId &&
        occ.actualAmountClp !== null
      ) {
        await upsertOccurrence(ctx.tenantId, occ.itemId, occ.scheduledDate, {
          amountClp: occ.actualAmountClp,
          status: "PAID",
          bankTransactionId: occ.bankTransactionId,
          matchedBy: ctx.userId,
        });
        accountMatched++;
      }
    }
  }

  // Fallback heurístico solo para las que quedaron sin match
  const stillProjected = projection.buckets.flatMap((b) =>
    b.occurrences.filter((o) => o.status === "PROJECTED" && !o.bankTransactionId),
  );
  const heuristic = await autoMatchOccurrencesToBankTx(
    ctx.tenantId,
    stillProjected,
    parsed.data.from,
    parsed.data.to,
    ctx.userId,
  );

  return NextResponse.json({
    success: true,
    data: {
      accountMatched,
      heuristicMatched: heuristic.matched,
      heuristicReviewed: heuristic.reviewed,
    },
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "match/route"`
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/finance/cashflow/match/route.ts
git commit -m "feat(finanzas/flujo-caja): match account-driven primero, heurístico como fallback"
```

---

### Task 2.7: Phase 2 verification

- [ ] **Step 1: Tests + typecheck**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/`
Expected: green.

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "cashflow"`
Expected: empty.

- [ ] **Step 2: Manual end-to-end**

In dev:
1. Crear un ítem proyectado "Movistar / Telefonía / $200.000 / día 5 mensual".
2. Crear un FinanceBankTransaction de -$220.000 con fecha 7 del mes, conciliarlo manualmente con un EXPENSE link a la cuenta `4.2.03.005`.
3. Recargar `/finanzas/flujo-caja`. La celda Telefonía / semana del 5 debe mostrar: proyectado $200.000 (strikethrough), real $220.000 (bold), varianza +$20.000 (amber).
4. POST a `/api/finance/cashflow/match` y verificar que persista `status=PAID` en `finance_cashflow_occurrences`.

- [ ] **Step 3: Push**

```bash
git push origin main
```

**Phase 2 done.**

---

# PHASE 3 — Dynamic forecast (drag & quick create)

**Outcome of this phase:** The user can drag any projected occurrence between weeks/months in the matrix; the cashflow re-projects on the fly. From any empty cell, a quick modal lets them create a recurring item in 3 fields.

**Pre-requisites:** Phase 2 complete and deployed.

### Task 3.1: `moveOccurrence` service + endpoint

**Files:**
- Modify: `src/modules/finance/cashflow/occurrence.service.ts`
- Create: `src/app/api/finance/cashflow/occurrences/[id]/move/route.ts`

- [ ] **Step 1: Add `moveOccurrence` to `occurrence.service.ts`**

Append to `src/modules/finance/cashflow/occurrence.service.ts`:
```typescript
export async function moveOccurrence(
  tenantId: string,
  id: string,
  newDate: Date,
): Promise<void> {
  const existing = await prisma.financeCashflowOccurrence.findFirst({
    where: { id, tenantId },
    select: { id: true, itemId: true, scheduledDate: true, status: true },
  });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  if (existing.status === "PAID") {
    throw new Error("No se puede mover una ocurrencia ya pagada/conciliada");
  }
  // Verificar que no exista ya una ocurrencia para ese item en la nueva fecha
  const collision = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, itemId: existing.itemId, scheduledDate: newDate },
  });
  if (collision && collision.id !== id) {
    throw new Error("Ya existe una ocurrencia de este ítem en esa fecha");
  }
  await prisma.financeCashflowOccurrence.update({
    where: { id },
    data: { scheduledDate: newDate, effectiveDate: newDate },
  });
}
```

- [ ] **Step 2: Create the endpoint**

Create `src/app/api/finance/cashflow/occurrences/[id]/move/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { moveOccurrence } from "@/modules/finance/cashflow/occurrence.service";

const moveSchema = z.object({ newDate: z.coerce.date() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const parsed = await parseBody(request, moveSchema);
    if (parsed.error) return parsed.error;
    await moveOccurrence(ctx.tenantId, id, parsed.data.newDate);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/finance/cashflow/occurrence.service.ts 'src/app/api/finance/cashflow/occurrences/[id]/move/'
git commit -m "feat(finanzas/flujo-caja): endpoint y service para reagendar ocurrencia"
```

---

### Task 3.2: `QuickItemModal` component

**Files:**
- Create: `src/components/finance/cashflow/QuickItemModal.tsx`
- Create: `src/components/finance/cashflow/__tests__/QuickItemModal.test.tsx`

- [ ] **Step 1: Build the minimal modal**

Create `src/components/finance/cashflow/QuickItemModal.tsx`:
```tsx
"use client";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface CategoryLite {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

interface Props {
  open: boolean;
  /** Día del mes pre-seleccionado al abrir desde una celda. */
  defaultDayOfMonth?: number;
  categories: CategoryLite[];
  onClose: () => void;
  onCreated: () => void;
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function QuickItemModal({ open, defaultDayOfMonth, categories, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(String(defaultDayOfMonth ?? 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) { setError("Selecciona una categoría"); return; }
    if (!name.trim()) { setError("Ingresa un nombre"); return; }
    const amt = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) { setError("Monto inválido"); return; }
    setSaving(true);
    const r = await fetch("/api/finance/cashflow/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        kind: cat.kind,
        name: name.trim(),
        amount: amt,
        currency: "CLP",
        recurrence: "MONTHLY",
        dayOfMonth: Number(dayOfMonth),
        startDate: new Date().toISOString().slice(0, 10),
      }),
    });
    const j = await r.json();
    setSaving(false);
    if (j?.success) {
      setName(""); setAmount(""); setCategoryId("");
      onCreated();
    } else {
      setError(j?.error ?? "Error al crear");
    }
  }

  function handleAmount(raw: string) {
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) { setAmount(raw); return; }
    setAmount(fmt.format(n));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>Nuevo ítem mensual</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.kind === "INCOME" ? "↑" : "↓"} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nombre</Label>
            <Input className="h-10 sm:h-9" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto (CLP)</Label>
              <Input
                className="h-10 sm:h-9 font-mono text-right"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Día del mes</Label>
              <Input
                className="h-10 sm:h-9"
                type="number"
                min={-1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-status-warn-fg text-[12px]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creando…" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it from `CashflowTabs.tsx`**

In `src/components/finance/cashflow/CashflowTabs.tsx`, add state to control the modal and a handler that the matrix can invoke:
```tsx
const [quickOpen, setQuickOpen] = useState(false);
const [quickDay, setQuickDay] = useState<number | undefined>(undefined);

function openQuick(dayOfMonth?: number) {
  setQuickDay(dayOfMonth);
  setQuickOpen(true);
}
```

Pass `openQuick` as a prop to `WeeklyMatrix` and `MonthlyMatrix`. In each matrix, add a "+" button at the top of each empty cell that calls `onQuickCreate(bucket.start.getDate())`.

Mount the modal at the bottom of `CashflowTabs.tsx`:
```tsx
<QuickItemModal
  open={quickOpen}
  defaultDayOfMonth={quickDay}
  categories={categories}
  onClose={() => setQuickOpen(false)}
  onCreated={() => { setQuickOpen(false); refresh(); }}
/>
```

`categories` and `refresh` should already exist in the tabs; if not, fetch categories on mount and refetch the projection on `onCreated`.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/cashflow/QuickItemModal.tsx src/components/finance/cashflow/CashflowTabs.tsx
git commit -m "feat(finanzas/flujo-caja): modal rápido para crear ítem mensual desde celda"
```

---

### Task 3.3: Drag & drop occurrences between buckets

**Files:**
- Create: `src/components/finance/cashflow/MatrixDnDProvider.tsx`
- Modify: `src/components/finance/cashflow/CashflowTabs.tsx`
- Modify: `src/components/finance/cashflow/MonthlyMatrix.tsx`
- Modify: `src/components/finance/cashflow/WeeklyMatrix.tsx`

- [ ] **Step 1: Install `@dnd-kit/core`**

Check first:
```bash
grep -E '"@dnd-kit/core"' package.json
```
If missing, install:
```bash
pnpm add @dnd-kit/core
```

- [ ] **Step 2: Create the provider**

Create `src/components/finance/cashflow/MatrixDnDProvider.tsx`:
```tsx
"use client";
import { ReactNode } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";

interface Props {
  children: ReactNode;
  onMove: (occurrenceId: string, targetBucketKey: string) => void;
}

export function MatrixDnDProvider({ children, onMove }: Props) {
  function handleDragEnd(e: DragEndEvent) {
    const occurrenceId = String(e.active.id);
    const targetBucketKey = e.over ? String(e.over.id) : null;
    if (!targetBucketKey) return;
    if (!occurrenceId.startsWith("occ-")) return;
    onMove(occurrenceId.replace(/^occ-/, ""), targetBucketKey);
  }
  return <DndContext onDragEnd={handleDragEnd}>{children}</DndContext>;
}
```

- [ ] **Step 3: Mark cells as droppable and items as draggable**

In `MonthlyMatrix.tsx` and `WeeklyMatrix.tsx`, add light wrappers:

```tsx
import { useDraggable, useDroppable } from "@dnd-kit/core";

function DraggableOccurrenceChip({
  occurrenceId,
  children,
}: { occurrenceId: string | null; children: ReactNode }) {
  const id = occurrenceId ? `occ-${occurrenceId}` : null;
  const drag = useDraggable({ id: id ?? "noop", disabled: !id });
  return (
    <span
      ref={drag.setNodeRef}
      {...(id ? drag.listeners : {})}
      {...(id ? drag.attributes : {})}
      style={{
        transform: drag.transform
          ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`
          : undefined,
        cursor: id ? "grab" : "default",
      }}
    >
      {children}
    </span>
  );
}

function DroppableBucketCell({
  bucketKey,
  children,
}: { bucketKey: string; children: ReactNode }) {
  const drop = useDroppable({ id: bucketKey });
  return (
    <td
      ref={drop.setNodeRef}
      className={drop.isOver ? "bg-status-info-soft" : undefined}
    >
      {children}
    </td>
  );
}
```

Wrap each cell `td` with `DroppableBucketCell` and each occurrence chip with `DraggableOccurrenceChip`.

- [ ] **Step 4: Wire `onMove` in `CashflowTabs.tsx`**

```tsx
async function handleMove(occurrenceId: string, targetBucketKey: string) {
  // bucketKey looks like "2026-W18" or "2026-05" — derive a target date:
  const targetDate = bucketKeyToDate(targetBucketKey, granularity);
  const r = await fetch(`/api/finance/cashflow/occurrences/${occurrenceId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newDate: targetDate.toISOString().slice(0, 10) }),
  });
  const j = await r.json();
  if (!j?.success) {
    alert(j?.error ?? "No se pudo mover");
    return;
  }
  refresh();
}

// Helper (or import from recurrence-engine if it already exists):
function bucketKeyToDate(key: string, granularity: "weekly" | "monthly"): Date {
  if (granularity === "monthly") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 5); // default to day 5 of target month
  }
  // weekly: "2026-W18"
  const [yStr, wStr] = key.split("-W");
  const y = Number(yStr);
  const w = Number(wStr);
  // Approximate: Jan 1st + (w-1)*7 days, snapped to the same weekday
  const jan1 = new Date(y, 0, 1);
  const target = new Date(jan1);
  target.setDate(jan1.getDate() + (w - 1) * 7);
  return target;
}
```

Wrap the matrices:
```tsx
<MatrixDnDProvider onMove={handleMove}>
  {granularity === "monthly" ? <MonthlyMatrix … /> : <WeeklyMatrix … />}
</MatrixDnDProvider>
```

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev`
Drag an occurrence chip from one column to another. The API should be called, the projection refreshed, and the chip should appear in the new column. PAID occurrences (matched) shouldn't be draggable (the cursor stays default thanks to `disabled`).

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/cashflow/MatrixDnDProvider.tsx src/components/finance/cashflow/CashflowTabs.tsx src/components/finance/cashflow/MonthlyMatrix.tsx src/components/finance/cashflow/WeeklyMatrix.tsx package.json pnpm-lock.yaml
git commit -m "feat(finanzas/flujo-caja): drag & drop para reagendar ocurrencias entre buckets"
```

---

### Task 3.4: Phase 3 verification

- [ ] **Step 1: Tests + typecheck**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/`
Run: `npx tsc --noEmit -p . 2>&1 | grep cashflow`
Expected: empty.

- [ ] **Step 2: Manual end-to-end**

In dev, on `/finanzas/flujo-caja`:
1. Click "+" en una celda vacía → modal abre con día del mes pre-seleccionado → crear ítem aparece en la matriz.
2. Arrastrar un ítem proyectado de semana A a semana B → la fila se reordena → el `dayOfMonth` del ítem original NO cambia (solo la ocurrencia materializada).
3. Intentar arrastrar una ocurrencia ya pagada → cursor default → no se puede.

- [ ] **Step 3: Push**

```bash
git push origin main
```

**Phase 3 done.**

---

# Plan-level verification

After all phases:

- [ ] **Step 1: Run full test suite**
Run: `npx vitest run`
Expected: all green, no regressions.

- [ ] **Step 2: Run full typecheck**
Run: `npx tsc --noEmit -p .`
Expected: no new errors in cashflow files.

- [ ] **Step 3: Production smoke (after deploy)**
On `opai.gard.cl`:
1. Configurar mappings categoría→cuenta.
2. Crear un ítem proyectado.
3. Importar cartola → conciliar → verificar match automático con varianza visible.
4. Mover una ocurrencia con drag & drop.

- [ ] **Step 4: Update memory**
Si durante la ejecución descubres que algo del modelo objetivo cambió (ej: 1:N pasó a N:M con prioridad ponderada), actualiza `cashflow_vision.md` en memoria.

---

## Notes for the executor

- **Each task is one commit minimum.** Commit between tasks. Push at end of each phase.
- **TDD is mandatory** for service code. Tests first, fail, implement, pass.
- **Tests that need fixture data** can return early / skip — don't add data setup. The integration smoke happens in dev manually.
- **Don't refactor outside the listed files.** If you see something tempting to clean up, leave it.
- **DS Guard warnings** about `text-[11px]` outside eyebrows: use `text-[12px]`. Never silence the guard.
- **Permissions** are unchanged — the existing `cashflow_view`/`cashflow_manage`/`cashflow_configure` capabilities cover everything in this plan.
