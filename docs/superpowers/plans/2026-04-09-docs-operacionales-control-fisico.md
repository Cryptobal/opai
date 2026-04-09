# Documentos Operacionales: Control Digital + Físico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralized operational document control combining digital upload tracking with physical verification by supervisors, exposed via a matrix grid in the Documentos module and an in-visit checklist on the supervisor mobile portal.

**Architecture:** New `DocVerificacionFisica` Prisma model stores per-document, per-installation physical checks linked to supervision visits. The existing `TipoDocOperacional` and guard document config gain an `obligatorioEnVisita` flag. Two new grid views aggregate digital + physical state across installations. The supervisor's Step3Checklist is extended to cover all 3 document layers with toggle + photo UX.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma, TypeScript, Tailwind CSS, Vitest + React Testing Library, Vercel Blob (photos), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-09-docs-operacionales-control-fisico-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `prisma/migrations/YYYYMMDD_doc_verificacion_fisica/migration.sql` | DB migration |
| `src/app/(app)/opai/documentos-operativos/page.tsx` | Server page: auth + data fetch |
| `src/components/docs/DocsOperativosClient.tsx` | Client orchestrator: tabs + filters |
| `src/components/docs/GrillaDocsInstalacion.tsx` | Matrix grid: installations × documents |
| `src/components/docs/GrillaDocsGuardias.tsx` | Accordion grid: installations → guards × documents |
| `src/components/docs/DocVerificacionDrawer.tsx` | Drawer panel: document detail + verification history |
| `src/components/docs/GrillaCelda.tsx` | Reusable cell component: digital + physical indicators |
| `src/app/api/operacional/verificaciones-fisicas/route.ts` | GET list + POST batch create |
| `src/app/api/operacional/grilla-docs/route.ts` | GET aggregated grid data for installations |
| `src/app/api/operacional/grilla-guardias/route.ts` | GET aggregated grid data for guards |
| `src/lib/__tests__/doc-verificacion-helpers.test.ts` | Unit tests for helper functions |
| `src/lib/doc-verificacion-helpers.ts` | Pure functions: compliance calc, status derivation |

### Modified files
| File | What changes |
|------|-------------|
| `prisma/schema.prisma` | Add `DocVerificacionFisica` model, add `obligatorioEnVisita` to `TipoDocOperacional` |
| `src/lib/guardia-documentos-config.ts` | Add `obligatorioEnVisita` field to type + defaults |
| `src/lib/instalacion-documentos.ts` | Add `obligatorioEnVisita` field to type + defaults |
| `src/components/ops/OpsDocsGuardiasTab.tsx` | Add "Obligatorio en visita" checkbox per doc type |
| `src/components/opai/GlobalDocumentsClient.tsx` | Add "Obligatorio en visita" toggle per global doc type |
| `src/components/opai/DocumentosSubnav.tsx` | Add "Docs Operativos" tab |
| `src/lib/module-nav.ts` | Add docs-operativos to DOCS_ITEMS + path detection |
| `src/components/supervision/wizard/types.ts` | Add `GuardDocCheckResult` type, extend `DocumentCheckResult` |
| `src/components/supervision/wizard/Step3Checklist.tsx` | Extend with 3-layer doc check + guard accordion + photos |

---

## Task 1: Prisma Schema — Add `obligatorioEnVisita` + `DocVerificacionFisica`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `obligatorioEnVisita` to `TipoDocOperacional`**

In `prisma/schema.prisma`, find the `TipoDocOperacional` model (around line 7681). Add the new field after `isActive`:

```prisma
  obligatorioEnVisita  Boolean  @default(false)
```

- [ ] **Step 2: Add `DocVerificacionFisica` model**

Add at the end of `prisma/schema.prisma`:

```prisma
model DocVerificacionFisica {
  id              String   @id @default(uuid())
  tenantId        String
  
  tipoDocId       String?
  guardiaDocType  String?
  capa            String            // "global" | "instalacion" | "guardia"
  
  installationId  String
  guardiaId       String?
  
  presente        Boolean
  photoUrl        String?
  photoKey        String?
  notes           String?           @db.Text
  
  supervisionId   String
  supervisorId    String
  
  hallazgoId      String?
  
  createdAt       DateTime @default(now())

  tenant          Tenant              @relation(fields: [tenantId], references: [id])
  installation    CrmInstallation     @relation(fields: [installationId], references: [id])
  supervision     OpsVisitaSupervision @relation(fields: [supervisionId], references: [id])
  supervisor      User                @relation(fields: [supervisorId], references: [id])
  tipoDoc         TipoDocOperacional? @relation(fields: [tipoDocId], references: [id])
  guardia         OpsGuardia?         @relation(fields: [guardiaId], references: [id])
  hallazgo        OpsSupervisionFinding? @relation(fields: [hallazgoId], references: [id])

  @@index([tenantId, installationId])
  @@index([tenantId, installationId, guardiaId])
  @@index([tenantId, tipoDocId])
  @@index([tenantId, supervisionId])
}
```

- [ ] **Step 3: Add reverse relations**

Add to each referenced model a reverse relation array:

In `TipoDocOperacional`:
```prisma
  verificacionesFisicas  DocVerificacionFisica[]
```

In `OpsVisitaSupervision`:
```prisma
  verificacionesFisicas  DocVerificacionFisica[]
```

In `OpsSupervisionFinding`:
```prisma
  verificacionFisica  DocVerificacionFisica?
```

In `CrmInstallation`:
```prisma
  verificacionesFisicas  DocVerificacionFisica[]
```

In `OpsGuardia`:
```prisma
  verificacionesFisicas  DocVerificacionFisica[]
```

In `User` (the supervisor):
```prisma
  verificacionesFisicas  DocVerificacionFisica[]
```

In `Tenant`:
```prisma
  verificacionesFisicas  DocVerificacionFisica[]
```

- [ ] **Step 4: Generate migration**

Run:
```bash
npx prisma migrate dev --name add_doc_verificacion_fisica
```
Expected: Migration created successfully, Prisma Client regenerated.

- [ ] **Step 5: Verify generation**

Run:
```bash
npx prisma generate
```
Expected: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add DocVerificacionFisica model + obligatorioEnVisita flag"
```

---

## Task 2: Config Layer — Add `obligatorioEnVisita` to Guard + Installation Doc Configs

**Files:**
- Modify: `src/lib/guardia-documentos-config.ts`
- Modify: `src/lib/instalacion-documentos.ts`

- [ ] **Step 1: Update `GuardiaDocumentoConfigItem` type**

In `src/lib/guardia-documentos-config.ts`, add to the type:

```typescript
export type GuardiaDocumentoConfigItem = {
  code: string;
  hasExpiration: boolean;
  alertDaysBefore: number;
  visibleInGuardForm?: boolean;
  visibleInTeForm?: boolean;
  obligatorioEnVisita?: boolean;  // NEW
};
```

- [ ] **Step 2: Set defaults for guard docs**

In the `getDefaults()` function or wherever `DOCUMENT_TYPES` is defined, add `obligatorioEnVisita: false` to each item. For `certificado_os10` and `credencial_os10`, set it to `true` as sensible defaults:

```typescript
{ code: "certificado_os10", hasExpiration: true, alertDaysBefore: 90, visibleInGuardForm: true, visibleInTeForm: true, obligatorioEnVisita: true },
{ code: "credencial_os10", hasExpiration: true, alertDaysBefore: 90, visibleInGuardForm: true, visibleInTeForm: false, obligatorioEnVisita: true },
```

All others: `obligatorioEnVisita: false`.

- [ ] **Step 3: Update `InstalacionDocumentItem` type**

In `src/lib/instalacion-documentos.ts`:

```typescript
export type InstalacionDocumentItem = {
  code: string;
  label: string;
  required: boolean;
  obligatorioEnVisita?: boolean;  // NEW
};
```

- [ ] **Step 4: Set defaults for installation docs**

```typescript
export const DEFAULT_INSTALACION_DOCUMENTS: InstalacionDocumentItem[] = [
  { code: "directiva_funcionamiento", label: "Directiva de funcionamiento", required: true, obligatorioEnVisita: true },
  { code: "contrato_guardias", label: "Contrato de guardias al día", required: true, obligatorioEnVisita: true },
  { code: "os10_guardias", label: "OS10 de los guardias", required: true, obligatorioEnVisita: true },
];
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardia-documentos-config.ts src/lib/instalacion-documentos.ts
git commit -m "feat: add obligatorioEnVisita to guard + installation doc configs"
```

---

## Task 3: Config UI — Add "Obligatorio en visita" Toggle to Admin Pages

**Files:**
- Modify: `src/components/ops/OpsDocsGuardiasTab.tsx`
- Modify: `src/components/opai/GlobalDocumentsClient.tsx`

- [ ] **Step 1: Add checkbox in `OpsDocsGuardiasTab.tsx`**

Find the section where each document renders checkboxes (Obligatorio, Visible formulario, Visible form. TE, Vence). After the "Vence" checkbox block, add:

```tsx
<label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
  <input
    type="checkbox"
    checked={!!gc?.obligatorioEnVisita}
    onChange={(e) =>
      updateGuardiaDocConfigItem(gcIdx, {
        obligatorioEnVisita: e.target.checked,
      })
    }
    className="accent-primary"
  />
  Oblig. en visita
</label>
```

Where `gc` is the matching `guardiaDocConfig` item and `gcIdx` is its index. Follow the exact same pattern as the existing "Obligatorio" checkbox.

- [ ] **Step 2: Add toggle in `GlobalDocumentsClient.tsx`**

In the `EmpresaTab` component, find where each `TipoDoc` is rendered (the list of document types with edit/delete actions). Add an "Obligatorio en visita" toggle button or checkbox next to each tipo.

This requires adding a PATCH/PUT call to update the `TipoDocOperacional.obligatorioEnVisita` field. The existing `PUT /api/operacional/tipos/[id]` endpoint already accepts field updates — add `obligatorioEnVisita` to the body.

In the tipo row, after the status badge area, add:

```tsx
<label className="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer">
  <input
    type="checkbox"
    checked={!!tipo.obligatorioEnVisita}
    onChange={async (e) => {
      const res = await fetch(`/api/operacional/tipos/${tipo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligatorioEnVisita: e.target.checked }),
      });
      if (res.ok) refreshTipos();
    }}
    className="accent-primary"
  />
  Oblig. en visita
</label>
```

This needs the `TipoDoc` type extended to include `obligatorioEnVisita: boolean` and the fetch for tipos to include this field.

- [ ] **Step 3: Update `GET /api/operacional/tipos` to return `obligatorioEnVisita`**

In `src/app/api/operacional/tipos/route.ts`, ensure the Prisma select includes `obligatorioEnVisita`. If it uses `select`, add the field. If it returns all fields, it should already work after the migration.

- [ ] **Step 4: Update `PUT /api/operacional/tipos/[id]` to accept `obligatorioEnVisita`**

In `src/app/api/operacional/tipos/[id]/route.ts`, add `obligatorioEnVisita` to the Zod schema or allowed update fields:

```typescript
obligatorioEnVisita: z.boolean().optional(),
```

And include it in the Prisma update:

```typescript
data: { ...validated, obligatorioEnVisita: validated.obligatorioEnVisita },
```

- [ ] **Step 5: Test manually**

1. Go to `/opai/configuracion/documentos-globales` → verify "Oblig. en visita" checkbox appears for each global doc type.
2. Go to `/opai/configuracion/ops?tab=docs-guardias` → verify "Oblig. en visita" checkbox appears for each guard doc type.
3. Toggle on/off and refresh — values should persist.

- [ ] **Step 6: Commit**

```bash
git add src/components/ops/OpsDocsGuardiasTab.tsx src/components/opai/GlobalDocumentsClient.tsx src/app/api/operacional/tipos/
git commit -m "feat: add obligatorioEnVisita toggle to global + guard doc config UI"
```

---

## Task 4: Helper Functions + Tests — Compliance Calculation

**Files:**
- Create: `src/lib/doc-verificacion-helpers.ts`
- Create: `src/lib/__tests__/doc-verificacion-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/doc-verificacion-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  calcCellStatus,
  calcCompliancePercent,
  type CellStatus,
} from "../doc-verificacion-helpers";

describe("calcCellStatus", () => {
  it("returns 'completo' when digital vigente + physical verified", () => {
    const result = calcCellStatus("vigente", true);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "ok",
    });
  });

  it("returns 'parcial' when digital vigente but no physical check", () => {
    const result = calcCellStatus("vigente", null);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "pendiente",
    });
  });

  it("returns 'parcial' when digital vigente but physical not found", () => {
    const result = calcCellStatus("vigente", false);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "falta",
    });
  });

  it("returns 'faltante' when no digital document", () => {
    const result = calcCellStatus("sin_documento", null);
    expect(result).toEqual<CellStatus>({
      digital: "falta",
      fisico: "pendiente",
    });
  });

  it("returns digital warning for por_vencer", () => {
    const result = calcCellStatus("por_vencer", true);
    expect(result).toEqual<CellStatus>({
      digital: "alerta",
      fisico: "ok",
    });
  });

  it("returns digital falta for vencido", () => {
    const result = calcCellStatus("vencido", true);
    expect(result).toEqual<CellStatus>({
      digital: "falta",
      fisico: "ok",
    });
  });
});

describe("calcCompliancePercent", () => {
  it("returns 100 when all cells are ok/ok", () => {
    const cells: CellStatus[] = [
      { digital: "ok", fisico: "ok" },
      { digital: "ok", fisico: "ok" },
    ];
    expect(calcCompliancePercent(cells)).toBe(100);
  });

  it("returns 50 when half checks are green", () => {
    const cells: CellStatus[] = [
      { digital: "ok", fisico: "ok" },    // 2 greens
      { digital: "falta", fisico: "falta" }, // 0 greens
    ];
    // 2 green out of 4 total = 50%
    expect(calcCompliancePercent(cells)).toBe(50);
  });

  it("returns 0 for empty cells", () => {
    expect(calcCompliancePercent([])).toBe(0);
  });

  it("counts digital ok + fisico pendiente as 1 of 2", () => {
    const cells: CellStatus[] = [
      { digital: "ok", fisico: "pendiente" },
    ];
    // 1 green (digital) out of 2 = 50%
    expect(calcCompliancePercent(cells)).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/__tests__/doc-verificacion-helpers.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper functions**

Create `src/lib/doc-verificacion-helpers.ts`:

```typescript
export type DigitalStatus = "ok" | "alerta" | "falta";
export type FisicoStatus = "ok" | "pendiente" | "falta";

export type CellStatus = {
  digital: DigitalStatus;
  fisico: FisicoStatus;
};

/**
 * Derive cell display status from digital doc status + last physical verification.
 * @param digitalStatus - "vigente" | "por_vencer" | "vencido" | "sin_documento" | "no_aplica"
 * @param fisicaPresente - true=found, false=not found, null=never checked
 */
export function calcCellStatus(
  digitalStatus: string,
  fisicaPresente: boolean | null,
): CellStatus {
  let digital: DigitalStatus;
  if (digitalStatus === "vigente") {
    digital = "ok";
  } else if (digitalStatus === "por_vencer") {
    digital = "alerta";
  } else {
    digital = "falta";
  }

  let fisico: FisicoStatus;
  if (fisicaPresente === true) {
    fisico = "ok";
  } else if (fisicaPresente === false) {
    fisico = "falta";
  } else {
    fisico = "pendiente";
  }

  return { digital, fisico };
}

/**
 * Calculate compliance percentage across cells.
 * Each cell has 2 dimensions; "ok" counts as 1 point.
 */
export function calcCompliancePercent(cells: CellStatus[]): number {
  if (cells.length === 0) return 0;
  const total = cells.length * 2;
  let greens = 0;
  for (const c of cells) {
    if (c.digital === "ok") greens++;
    if (c.fisico === "ok") greens++;
  }
  return Math.round((greens / total) * 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/__tests__/doc-verificacion-helpers.test.ts
```
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/doc-verificacion-helpers.ts src/lib/__tests__/doc-verificacion-helpers.test.ts
git commit -m "feat: add doc verification helper functions with tests"
```

---

## Task 5: API — Verificaciones Físicas CRUD

**Files:**
- Create: `src/app/api/operacional/verificaciones-fisicas/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/operacional/verificaciones-fisicas/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionOrFail } from "@/lib/api-auth";

const querySchema = z.object({
  installationId: z.string().optional(),
  tipoDocId: z.string().optional(),
  guardiaId: z.string().optional(),
  guardiaDocType: z.string().optional(),
  capa: z.enum(["global", "instalacion", "guardia"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionOrFail(req);
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;

  const params = querySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams),
  );

  const where: Record<string, unknown> = { tenantId };
  if (params.installationId) where.installationId = params.installationId;
  if (params.tipoDocId) where.tipoDocId = params.tipoDocId;
  if (params.guardiaId) where.guardiaId = params.guardiaId;
  if (params.guardiaDocType) where.guardiaDocType = params.guardiaDocType;
  if (params.capa) where.capa = params.capa;

  const items = await prisma.docVerificacionFisica.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    include: {
      supervisor: { select: { id: true, name: true } },
      supervision: { select: { id: true, createdAt: true } },
      hallazgo: { select: { id: true, ticketId: true, severity: true } },
    },
  });

  const hasMore = items.length > params.limit;
  if (hasMore) items.pop();

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
  });
}

const verificacionSchema = z.object({
  tipoDocId: z.string().nullable().optional(),
  guardiaDocType: z.string().nullable().optional(),
  capa: z.enum(["global", "instalacion", "guardia"]),
  installationId: z.string(),
  guardiaId: z.string().nullable().optional(),
  presente: z.boolean(),
  photoUrl: z.string().nullable().optional(),
  photoKey: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const batchSchema = z.object({
  supervisionId: z.string(),
  verificaciones: z.array(verificacionSchema).min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSessionOrFail(req);
  if (session instanceof NextResponse) return session;
  const { tenantId, userId } = session;

  const body = batchSchema.parse(await req.json());

  // Verify supervision belongs to tenant
  const supervision = await prisma.opsVisitaSupervision.findFirst({
    where: { id: body.supervisionId, tenantId },
  });
  if (!supervision) {
    return NextResponse.json({ error: "Visita no encontrada" }, { status: 404 });
  }

  const created = await prisma.$transaction(
    body.verificaciones.map((v) =>
      prisma.docVerificacionFisica.create({
        data: {
          tenantId,
          tipoDocId: v.tipoDocId ?? null,
          guardiaDocType: v.guardiaDocType ?? null,
          capa: v.capa,
          installationId: v.installationId,
          guardiaId: v.guardiaId ?? null,
          presente: v.presente,
          photoUrl: v.photoUrl ?? null,
          photoKey: v.photoKey ?? null,
          notes: v.notes ?? null,
          supervisionId: body.supervisionId,
          supervisorId: userId,
        },
      }),
    ),
  );

  return NextResponse.json({ created: created.length }, { status: 201 });
}
```

- [ ] **Step 2: Test manually with curl or API client**

Start dev server and POST a test verification to confirm the endpoint works.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/operacional/verificaciones-fisicas/route.ts
git commit -m "feat: add verificaciones-fisicas API (GET + POST batch)"
```

---

## Task 6: API — Grid Data Endpoints

**Files:**
- Create: `src/app/api/operacional/grilla-docs/route.ts`
- Create: `src/app/api/operacional/grilla-guardias/route.ts`

- [ ] **Step 1: Create installation grid API**

Create `src/app/api/operacional/grilla-docs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionOrFail } from "@/lib/api-auth";
import { calcDocStatus } from "@/lib/docs-operacionales";

export async function GET(req: NextRequest) {
  const session = await getSessionOrFail(req);
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;

  const filtro = req.nextUrl.searchParams.get("filtro") ?? "obligatorio_visita";
  const search = req.nextUrl.searchParams.get("search") ?? "";

  // 1. Get document types (global + instalacion) with optional filter
  const tipoWhere: Record<string, unknown> = {
    tenantId,
    isActive: true,
    capa: { in: ["global", "instalacion"] },
  };
  if (filtro === "obligatorio_visita") {
    tipoWhere.obligatorioEnVisita = true;
  }

  const tipos = await prisma.tipoDocOperacional.findMany({
    where: tipoWhere,
    orderBy: [{ capa: "asc" }, { order: "asc" }],
    select: {
      id: true,
      codigo: true,
      nombre: true,
      capa: true,
      obligatorio: true,
      obligatorioEnVisita: true,
      tieneVencimiento: true,
      diasAlerta: true,
    },
  });

  // 2. Get active installations
  const installWhere: Record<string, unknown> = {
    tenantId,
    status: "Activa",
  };
  if (search) {
    installWhere.name = { contains: search, mode: "insensitive" };
  }

  const installations = await prisma.crmInstallation.findMany({
    where: installWhere,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
  });

  const installationIds = installations.map((i) => i.id);
  const tipoIds = tipos.map((t) => t.id);

  // 3. Get digital docs for these installations + types
  const docs = await prisma.docOperacional.findMany({
    where: {
      tenantId,
      tipoId: { in: tipoIds },
      OR: [
        { installationId: { in: installationIds } },
        { capa: "global" },
      ],
    },
    select: {
      id: true,
      tipoId: true,
      installationId: true,
      capa: true,
      status: true,
      expiresAt: true,
    },
  });

  // 4. Get latest physical verification per tipo+installation
  const verificaciones = await prisma.docVerificacionFisica.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      tipoDocId: { in: tipoIds },
      capa: { in: ["global", "instalacion"] },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["tipoDocId", "installationId"],
    select: {
      tipoDocId: true,
      installationId: true,
      presente: true,
      createdAt: true,
      supervisor: { select: { name: true } },
    },
  });

  // 5. Get last supervision visit per installation
  const lastVisits = await prisma.opsVisitaSupervision.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      status: "completada",
    },
    orderBy: { createdAt: "desc" },
    distinct: ["installationId"],
    select: {
      installationId: true,
      createdAt: true,
    },
  });

  // 6. Build response grid
  const docsByTipoInstall = new Map<string, typeof docs[0]>();
  for (const d of docs) {
    const key = d.capa === "global"
      ? `${d.tipoId}:global`
      : `${d.tipoId}:${d.installationId}`;
    docsByTipoInstall.set(key, d);
  }

  const verifByTipoInstall = new Map<string, typeof verificaciones[0]>();
  for (const v of verificaciones) {
    verifByTipoInstall.set(`${v.tipoDocId}:${v.installationId}`, v);
  }

  const lastVisitMap = new Map<string, Date>();
  for (const lv of lastVisits) {
    lastVisitMap.set(lv.installationId, lv.createdAt);
  }

  const rows = installations.map((inst) => {
    const cells = tipos.map((tipo) => {
      const docKey = tipo.capa === "global"
        ? `${tipo.id}:global`
        : `${tipo.id}:${inst.id}`;
      const doc = docsByTipoInstall.get(docKey);
      const verif = verifByTipoInstall.get(`${tipo.id}:${inst.id}`);

      const digitalStatus = doc
        ? calcDocStatus(doc.expiresAt, tipo.tieneVencimiento, tipo.diasAlerta)
        : "sin_documento";

      return {
        tipoDocId: tipo.id,
        digitalStatus,
        fisicaPresente: verif?.presente ?? null,
        ultimaVerificacion: verif?.createdAt ?? null,
        supervisorName: verif?.supervisor?.name ?? null,
      };
    });

    return {
      installationId: inst.id,
      installationName: inst.name,
      lastVisit: lastVisitMap.get(inst.id) ?? null,
      cells,
    };
  });

  return NextResponse.json({ tipos, rows });
}
```

- [ ] **Step 2: Create guard grid API**

Create `src/app/api/operacional/grilla-guardias/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionOrFail } from "@/lib/api-auth";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import { calcDocStatus } from "@/lib/docs-operacionales";

export async function GET(req: NextRequest) {
  const session = await getSessionOrFail(req);
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;

  const filtro = req.nextUrl.searchParams.get("filtro") ?? "obligatorio_visita";
  const search = req.nextUrl.searchParams.get("search") ?? "";

  // 1. Get guard document config
  const guardiaConfig = await getGuardiaDocumentosConfig(tenantId);
  const filteredConfig = filtro === "obligatorio_visita"
    ? guardiaConfig.filter((c) => c.obligatorioEnVisita)
    : filtro === "obligatorio"
      ? guardiaConfig.filter((c) => (c as Record<string, unknown>).obligatorio !== false)
      : guardiaConfig;

  // 2. Get active installations with their assigned guards
  const installWhere: Record<string, unknown> = {
    tenantId,
    status: "Activa",
  };
  if (search) {
    installWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const installations = await prisma.crmInstallation.findMany({
    where: installWhere,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      dotacion: {
        where: { isActive: true },
        select: {
          guardiaId: true,
          guardia: {
            select: {
              id: true,
              fullName: true,
              rut: true,
              documentos: {
                select: {
                  type: true,
                  status: true,
                  expiresAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const installationIds = installations.map((i) => i.id);

  // 3. Get physical verifications for guards
  const verificaciones = await prisma.docVerificacionFisica.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      capa: "guardia",
    },
    orderBy: { createdAt: "desc" },
    distinct: ["guardiaDocType", "installationId", "guardiaId"],
    select: {
      guardiaDocType: true,
      installationId: true,
      guardiaId: true,
      presente: true,
      createdAt: true,
    },
  });

  const verifMap = new Map<string, typeof verificaciones[0]>();
  for (const v of verificaciones) {
    verifMap.set(`${v.guardiaId}:${v.guardiaDocType}:${v.installationId}`, v);
  }

  // 4. Get last visits
  const lastVisits = await prisma.opsVisitaSupervision.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      status: "completada",
    },
    orderBy: { createdAt: "desc" },
    distinct: ["installationId"],
    select: { installationId: true, createdAt: true },
  });

  const lastVisitMap = new Map<string, Date>();
  for (const lv of lastVisits) {
    lastVisitMap.set(lv.installationId, lv.createdAt);
  }

  // 5. Build response
  const docTypes = filteredConfig.map((c) => ({
    code: c.code,
    hasExpiration: c.hasExpiration,
  }));

  const rows = installations.map((inst) => {
    const guardias = inst.dotacion.map((d) => {
      const guardia = d.guardia;
      const cells = filteredConfig.map((cfg) => {
        const doc = guardia.documentos.find((doc) => doc.type === cfg.code);
        const verif = verifMap.get(`${guardia.id}:${cfg.code}:${inst.id}`);
        const digitalStatus = doc
          ? calcDocStatus(doc.expiresAt, cfg.hasExpiration, cfg.alertDaysBefore)
          : "sin_documento";
        return {
          docType: cfg.code,
          digitalStatus,
          fisicaPresente: verif?.presente ?? null,
          ultimaVerificacion: verif?.createdAt ?? null,
        };
      });

      return {
        guardiaId: guardia.id,
        guardiaName: guardia.fullName,
        guardiaRut: guardia.rut,
        cells,
      };
    });

    return {
      installationId: inst.id,
      installationName: inst.name,
      lastVisit: lastVisitMap.get(inst.id) ?? null,
      guardiasCount: guardias.length,
      guardias,
    };
  });

  return NextResponse.json({ docTypes, rows });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/operacional/grilla-docs/route.ts src/app/api/operacional/grilla-guardias/route.ts
git commit -m "feat: add grid data APIs for installation + guard docs"
```

---

## Task 7: Navigation — Add "Docs Operativos" Tab

**Files:**
- Modify: `src/components/opai/DocumentosSubnav.tsx`
- Modify: `src/lib/module-nav.ts`

- [ ] **Step 1: Update `DocumentosSubnav.tsx`**

```typescript
"use client";

import { SubNav } from "@/components/opai/SubNav";
import { FileText, FolderOpen, ClipboardCheck } from "lucide-react";

const DOCS_NAV_ITEMS = [
  { href: "/opai/inicio", label: "Presentaciones", icon: FileText },
  { href: "/opai/documentos", label: "Gestión Documental", icon: FolderOpen },
  { href: "/opai/documentos-operativos", label: "Docs Operativos", icon: ClipboardCheck },
];

export function DocumentosSubnav() {
  return <SubNav items={DOCS_NAV_ITEMS} />;
}
```

- [ ] **Step 2: Update `module-nav.ts` DOCS_ITEMS**

In `src/lib/module-nav.ts`, add to the `DOCS_ITEMS` array:

```typescript
const DOCS_ITEMS: BottomNavItem[] = [
  { key: "docs-presentaciones", href: "/opai/inicio", label: "Envíos", icon: FileText },
  { key: "docs-gestion", href: "/opai/documentos", label: "Gestión", icon: FolderOpen },
  { key: "docs-operativos", href: "/opai/documentos-operativos", label: "Operativos", icon: ClipboardCheck },
];
```

Add `ClipboardCheck` to the lucide-react imports at the top of the file.

- [ ] **Step 3: Update path detection**

In the module detection block (around line 324), add the new path:

```typescript
{
  test: (p) =>
    p.startsWith("/opai/inicio") ||
    p.startsWith("/opai/documentos") ||
    p.startsWith("/opai/documentos-operativos") ||
    p.startsWith("/opai/templates"),
  getItems: (_perms, isModEnabled) => isModEnabled("documentos") ? DOCS_ITEMS : [],
},
```

- [ ] **Step 4: Commit**

```bash
git add src/components/opai/DocumentosSubnav.tsx src/lib/module-nav.ts
git commit -m "feat: add Docs Operativos tab to navigation"
```

---

## Task 8: Reusable Cell Component

**Files:**
- Create: `src/components/docs/GrillaCelda.tsx`

- [ ] **Step 1: Create the cell component**

Create `src/components/docs/GrillaCelda.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { CellStatus } from "@/lib/doc-verificacion-helpers";

type Props = {
  status: CellStatus;
  onClick?: () => void;
  compact?: boolean; // for guard rows
};

const digitalIcons: Record<string, { bg: string; text: string; icon: string }> = {
  ok: { bg: "bg-green-500/15", text: "text-green-500", icon: "📄" },
  alerta: { bg: "bg-amber-500/15", text: "text-amber-500", icon: "📄" },
  falta: { bg: "bg-red-500/15", text: "text-red-500", icon: "✗" },
};

const fisicoIcons: Record<string, { bg: string; text: string; icon: string }> = {
  ok: { bg: "bg-green-500/15", text: "text-green-500", icon: "👁" },
  pendiente: { bg: "bg-amber-500/15", text: "text-amber-500", icon: "—" },
  falta: { bg: "bg-red-500/15", text: "text-red-500", icon: "✗" },
};

export function GrillaCelda({ status, onClick, compact }: Props) {
  const d = digitalIcons[status.digital];
  const f = fisicoIcons[status.fisico];
  const size = compact ? "w-6 h-6 text-xs" : "w-7 h-7 text-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex justify-center gap-1 p-1 rounded hover:bg-accent/30 transition-colors cursor-pointer"
    >
      <span
        className={cn(size, "inline-flex items-center justify-center rounded-md", d.bg, d.text)}
        title={`Digital: ${status.digital}`}
      >
        {d.icon}
      </span>
      <span
        className={cn(size, "inline-flex items-center justify-center rounded-md", f.bg, f.text)}
        title={`Físico: ${status.fisico}`}
      >
        {f.icon}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/docs/GrillaCelda.tsx
git commit -m "feat: add reusable GrillaCelda component for doc status"
```

---

## Task 9: Drawer Component — Verification History

**Files:**
- Create: `src/components/docs/DocVerificacionDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

Create `src/components/docs/DocVerificacionDrawer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { X, Camera, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Verificacion = {
  id: string;
  presente: boolean;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  supervisor: { id: string; name: string };
  supervision: { id: string; createdAt: string };
  hallazgo: { id: string; ticketId: string | null; severity: string } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  docName: string;
  capa: string;
  installationName: string;
  guardiaName?: string | null;
  guardiaRut?: string | null;
  digitalStatus: string;
  obligatorioEnVisita: boolean;
  // Fetch params
  tipoDocId?: string | null;
  guardiaDocType?: string | null;
  installationId: string;
  guardiaId?: string | null;
};

export function DocVerificacionDrawer({
  open,
  onClose,
  docName,
  capa,
  installationName,
  guardiaName,
  guardiaRut,
  digitalStatus,
  obligatorioEnVisita,
  tipoDocId,
  guardiaDocType,
  installationId,
  guardiaId,
}: Props) {
  const [verificaciones, setVerificaciones] = useState<Verificacion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("installationId", installationId);
    if (tipoDocId) params.set("tipoDocId", tipoDocId);
    if (guardiaDocType) params.set("guardiaDocType", guardiaDocType);
    if (guardiaId) params.set("guardiaId", guardiaId);
    params.set("capa", capa);
    params.set("limit", "20");

    fetch(`/api/operacional/verificaciones-fisicas?${params}`)
      .then((r) => r.json())
      .then((data) => setVerificaciones(data.items ?? []))
      .finally(() => setLoading(false));
  }, [open, installationId, tipoDocId, guardiaDocType, guardiaId, capa]);

  const lastVerif = verificaciones[0];
  const fisicoLabel = lastVerif
    ? lastVerif.presente
      ? "Verificado OK"
      : "No encontrado"
    : "Sin verificación";

  const digitalLabel =
    digitalStatus === "vigente" ? "Vigente" :
    digitalStatus === "por_vencer" ? "Por vencer" :
    digitalStatus === "vencido" ? "Vencido" :
    "Sin documento";

  const digitalColor =
    digitalStatus === "vigente" ? "text-green-500" :
    digitalStatus === "por_vencer" ? "text-amber-500" :
    "text-red-500";

  const fisicoColor = lastVerif
    ? lastVerif.presente ? "text-green-500" : "text-red-500"
    : "text-muted-foreground";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalle de Documento</SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="mt-4 space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Documento</div>
          <div className="text-lg font-bold">{docName}</div>
          <div className="text-sm text-muted-foreground">
            Instalación: <span className="text-foreground font-medium">{installationName}</span>
          </div>
          {guardiaName && (
            <div className="text-sm text-muted-foreground">
              Guardia: <span className="text-foreground font-medium">{guardiaName}</span>
              {guardiaRut && <span className="ml-1 text-xs">({guardiaRut})</span>}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Capa: {capa === "global" ? "Global" : capa === "instalacion" ? "Instalación" : "Guardia"}
            {obligatorioEnVisita && (
              <Badge variant="outline" className="ml-2 text-[10px] border-primary/30 text-primary">
                Obligatorio en visita
              </Badge>
            )}
          </div>
        </div>

        {/* Status cards */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className={cn(
            "rounded-lg border p-3 text-center",
            digitalStatus === "vigente" ? "border-green-500/20 bg-green-500/5" :
            digitalStatus === "por_vencer" ? "border-amber-500/20 bg-amber-500/5" :
            "border-red-500/20 bg-red-500/5"
          )}>
            <div className="text-xl">📄</div>
            <div className={cn("text-xs font-semibold mt-1", digitalColor)}>{digitalLabel}</div>
            <div className="text-[10px] text-muted-foreground">Digital</div>
          </div>
          <div className={cn(
            "rounded-lg border p-3 text-center",
            lastVerif?.presente ? "border-green-500/20 bg-green-500/5" :
            lastVerif && !lastVerif.presente ? "border-red-500/20 bg-red-500/5" :
            "border-border bg-muted/30"
          )}>
            <div className="text-xl">{lastVerif?.presente ? "👁" : lastVerif ? "✗" : "—"}</div>
            <div className={cn("text-xs font-semibold mt-1", fisicoColor)}>{fisicoLabel}</div>
            <div className="text-[10px] text-muted-foreground">Físico</div>
          </div>
        </div>

        {/* History */}
        <div className="mt-6">
          <div className="text-sm font-semibold mb-3">Historial de Verificaciones Físicas</div>
          {loading && <div className="text-sm text-muted-foreground text-center py-4">Cargando...</div>}
          {!loading && verificaciones.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">Sin verificaciones registradas</div>
          )}
          <div className="space-y-2">
            {verificaciones.map((v) => (
              <div key={v.id} className="rounded-lg border bg-card p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {v.presente ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      {v.presente ? "Verificado OK" : "No encontrado"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{v.supervisor.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(v.createdAt).toLocaleDateString("es-CL")} ·{" "}
                      {new Date(v.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Visita #{v.supervision.id.slice(-6)}
                  </div>
                </div>
                {v.hallazgo && (
                  <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    Hallazgo {v.hallazgo.severity}
                    {v.hallazgo.ticketId && <span className="ml-1">· Ticket #{v.hallazgo.ticketId.slice(-6)}</span>}
                  </div>
                )}
                {v.photoUrl && (
                  <div className="mt-2">
                    <a href={v.photoUrl} target="_blank" rel="noreferrer">
                      <div className="w-14 h-14 rounded-md border border-primary/30 bg-primary/10 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors">
                        <Camera className="h-5 w-5 text-primary" />
                      </div>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!loading && verificaciones.length > 0 && (
            <div className="text-center text-xs text-muted-foreground mt-3">
              {verificaciones.length} verificación{verificaciones.length !== 1 ? "es" : ""} registrada{verificaciones.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/docs/DocVerificacionDrawer.tsx
git commit -m "feat: add DocVerificacionDrawer with verification history"
```

---

## Task 10: Grid View — Installation Documents

**Files:**
- Create: `src/components/docs/GrillaDocsInstalacion.tsx`

- [ ] **Step 1: Create the grid component**

Create `src/components/docs/GrillaDocsInstalacion.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { calcCellStatus, calcCompliancePercent, type CellStatus } from "@/lib/doc-verificacion-helpers";
import { GrillaCelda } from "./GrillaCelda";
import { DocVerificacionDrawer } from "./DocVerificacionDrawer";

type TipoDoc = {
  id: string;
  codigo: string;
  nombre: string;
  capa: string;
  obligatorio: boolean;
  obligatorioEnVisita: boolean;
};

type CellData = {
  tipoDocId: string;
  digitalStatus: string;
  fisicaPresente: boolean | null;
  ultimaVerificacion: string | null;
  supervisorName: string | null;
};

type Row = {
  installationId: string;
  installationName: string;
  lastVisit: string | null;
  cells: CellData[];
};

type DrawerState = {
  open: boolean;
  tipoDocId: string;
  tipoDocName: string;
  capa: string;
  installationId: string;
  installationName: string;
  digitalStatus: string;
  obligatorioEnVisita: boolean;
} | null;

export function GrillaDocsInstalacion() {
  const [tipos, setTipos] = useState<TipoDoc[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"obligatorio_visita" | "todos">("obligatorio_visita");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("filtro", filtro);
    if (search) params.set("search", search);
    const res = await fetch(`/api/operacional/grilla-docs?${params}`);
    const data = await res.json();
    setTipos(data.tipos ?? []);
    // Sort rows by compliance ascending (worst first)
    const sorted = (data.rows ?? []).sort((a: Row, b: Row) => {
      const aPercent = calcCompliancePercent(a.cells.map((c: CellData) => calcCellStatus(c.digitalStatus, c.fisicaPresente)));
      const bPercent = calcCompliancePercent(b.cells.map((c: CellData) => calcCellStatus(c.digitalStatus, c.fisicaPresente)));
      return aPercent - bPercent;
    });
    setRows(sorted);
    setLoading(false);
  }, [filtro, search]);

  useEffect(() => {
    const timeout = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchData, search]);

  function formatTimeAgo(dateStr: string | null) {
    if (!dateStr) return "Sin visita";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Hoy";
    if (days === 1) return "Ayer";
    return `Hace ${days} días`;
  }

  function percentColor(p: number) {
    if (p >= 80) return "text-green-500";
    if (p >= 50) return "text-amber-500";
    return "text-red-500";
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Input
          placeholder="Buscar instalación..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[220px] h-9 text-sm"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setFiltro("obligatorio_visita")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filtro === "obligatorio_visita"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            Obligatorio en visita
          </button>
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filtro === "todos"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            Todos
          </button>
        </div>
        <div className="ml-auto hidden lg:flex gap-4 text-xs text-muted-foreground">
          <span>🟢 Digital OK + Verificado</span>
          <span>🟡 Digital OK, sin verificar</span>
          <span>🔴 Faltante</span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">Cargando grilla...</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${200 + 50 + tipos.length * 110}px` }}>
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left p-2.5 sticky left-0 bg-background z-10 min-w-[200px] border-b">
                  Instalación
                </th>
                <th className="text-center p-2.5 border-b min-w-[50px] text-xs text-primary font-bold">
                  %
                </th>
                {tipos.map((t) => (
                  <th key={t.id} className="text-center p-2.5 border-b min-w-[110px]">
                    <div className="text-xs font-medium leading-tight">{t.nombre}</div>
                    <div className="text-[10px] text-muted-foreground">{t.capa === "global" ? "Global" : "Instalación"}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cellStatuses: CellStatus[] = row.cells.map((c) =>
                  calcCellStatus(c.digitalStatus, c.fisicaPresente)
                );
                const percent = calcCompliancePercent(cellStatuses);

                return (
                  <tr key={row.installationId} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2.5 sticky left-0 bg-background z-[1]">
                      <div className="font-semibold text-sm">{row.installationName}</div>
                      <div className={cn("text-[11px]", row.lastVisit ? "text-muted-foreground" : "text-red-500")}>
                        {formatTimeAgo(row.lastVisit)}
                      </div>
                    </td>
                    <td className="text-center p-2.5">
                      <span className={cn("font-bold text-sm", percentColor(percent))}>{percent}%</span>
                    </td>
                    {row.cells.map((cell, i) => {
                      const status = cellStatuses[i];
                      const tipo = tipos[i];
                      return (
                        <td key={tipo.id} className="text-center p-1">
                          <GrillaCelda
                            status={status}
                            onClick={() =>
                              setDrawer({
                                open: true,
                                tipoDocId: tipo.id,
                                tipoDocName: tipo.nombre,
                                capa: tipo.capa,
                                installationId: row.installationId,
                                installationName: row.installationName,
                                digitalStatus: cell.digitalStatus,
                                obligatorioEnVisita: tipo.obligatorioEnVisita,
                              })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={tipos.length + 2} className="text-center py-8 text-muted-foreground text-sm">
                    No se encontraron instalaciones
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <DocVerificacionDrawer
          open={drawer.open}
          onClose={() => setDrawer(null)}
          docName={drawer.tipoDocName}
          capa={drawer.capa}
          installationName={drawer.installationName}
          digitalStatus={drawer.digitalStatus}
          obligatorioEnVisita={drawer.obligatorioEnVisita}
          tipoDocId={drawer.tipoDocId}
          installationId={drawer.installationId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/docs/GrillaDocsInstalacion.tsx
git commit -m "feat: add GrillaDocsInstalacion matrix grid component"
```

---

## Task 11: Grid View — Guard Documents

**Files:**
- Create: `src/components/docs/GrillaDocsGuardias.tsx`

- [ ] **Step 1: Create the guard grid component**

Create `src/components/docs/GrillaDocsGuardias.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { calcCellStatus, calcCompliancePercent, type CellStatus } from "@/lib/doc-verificacion-helpers";
import { GrillaCelda } from "./GrillaCelda";
import { DocVerificacionDrawer } from "./DocVerificacionDrawer";

type DocType = { code: string; hasExpiration: boolean };

type GuardCellData = {
  docType: string;
  digitalStatus: string;
  fisicaPresente: boolean | null;
  ultimaVerificacion: string | null;
};

type Guardia = {
  guardiaId: string;
  guardiaName: string;
  guardiaRut: string | null;
  cells: GuardCellData[];
};

type InstRow = {
  installationId: string;
  installationName: string;
  lastVisit: string | null;
  guardiasCount: number;
  guardias: Guardia[];
};

type DrawerState = {
  open: boolean;
  docType: string;
  docName: string;
  installationId: string;
  installationName: string;
  guardiaId: string;
  guardiaName: string;
  guardiaRut: string | null;
  digitalStatus: string;
} | null;

// Label mapping for guard doc types
const DOC_LABELS: Record<string, string> = {
  certificado_os10: "Cert. OS10",
  credencial_os10: "Credencial OS10",
  contrato: "Contrato",
  contrato_firmado: "Contrato Firmado",
  certificado_antecedentes: "Cert. Antec.",
  examen_psicologico: "Examen Psic.",
  registro_capacitacion: "Reg. Capacitación",
  cedula_identidad: "Cédula ID",
  curriculum: "Curriculum",
  certificado_afp: "Cert. AFP",
  certificado_fonasa_isapre: "Fonasa/Isapre",
  historial_penal: "Hist. Penal",
  certificado_ensenanza_media: "Enseñanza Media",
  anexo_contrato: "Anexo Contrato",
};

export function GrillaDocsGuardias() {
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [rows, setRows] = useState<InstRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"obligatorio_visita" | "obligatorio" | "todos">("obligatorio_visita");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("filtro", filtro);
    if (search) params.set("search", search);
    const res = await fetch(`/api/operacional/grilla-guardias?${params}`);
    const data = await res.json();
    setDocTypes(data.docTypes ?? []);
    setRows(data.rows ?? []);
    setLoading(false);
  }, [filtro, search]);

  useEffect(() => {
    const timeout = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchData, search]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function formatTimeAgo(dateStr: string | null) {
    if (!dateStr) return "Sin visita";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Hoy";
    if (days === 1) return "Ayer";
    return `Hace ${days} días`;
  }

  function percentColor(p: number) {
    if (p >= 80) return "text-green-500";
    if (p >= 50) return "text-amber-500";
    return "text-red-500";
  }

  function avatarColor(p: number) {
    if (p >= 80) return "bg-green-500/20 text-green-500";
    if (p >= 50) return "bg-amber-500/20 text-amber-500";
    return "bg-red-500/20 text-red-500";
  }

  function initials(name: string) {
    return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Input
          placeholder="Buscar instalación o guardia..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[250px] h-9 text-sm"
        />
        <div className="flex gap-1">
          {(["obligatorio_visita", "obligatorio", "todos"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                filtro === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {f === "obligatorio_visita" ? "Oblig. en visita" : f === "obligatorio" ? "Solo obligatorios" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">Cargando grilla...</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${220 + 45 + docTypes.length * 100}px` }}>
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left p-2.5 sticky left-0 bg-background z-10 min-w-[220px] border-b">
                  Instalación / Guardia
                </th>
                <th className="text-center p-2.5 border-b min-w-[45px] text-xs text-primary font-bold">%</th>
                {docTypes.map((dt) => (
                  <th key={dt.code} className="text-center p-2.5 border-b min-w-[100px]">
                    <div className="text-xs font-medium leading-tight">{DOC_LABELS[dt.code] ?? dt.code}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((inst) => {
                const isExpanded = expanded.has(inst.installationId);
                // Calc avg compliance for installation
                const allGuardCells = inst.guardias.flatMap((g) =>
                  g.cells.map((c) => calcCellStatus(c.digitalStatus, c.fisicaPresente))
                );
                const instPercent = calcCompliancePercent(allGuardCells);

                return (
                  <>
                    {/* Installation row */}
                    <tr
                      key={inst.installationId}
                      className={cn(
                        "cursor-pointer border-b",
                        isExpanded ? "bg-primary/5" : "bg-muted/10 hover:bg-muted/20"
                      )}
                      onClick={() => toggleExpand(inst.installationId)}
                    >
                      <td className={cn(
                        "p-2.5 sticky left-0 z-[1] border-b",
                        isExpanded ? "bg-primary/8" : "bg-muted/10"
                      )}>
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div>
                            <div className={cn("font-bold", isExpanded && "text-primary")}>{inst.installationName}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {inst.guardiasCount} guardias · {formatTimeAgo(inst.lastVisit)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={cn("text-center p-2.5 border-b", isExpanded ? "bg-primary/5" : "bg-muted/10")}>
                        <span className={cn("font-bold", percentColor(instPercent))}>{instPercent}%</span>
                      </td>
                      <td
                        colSpan={docTypes.length}
                        className={cn("p-2.5 text-center text-xs text-muted-foreground border-b", isExpanded ? "bg-primary/5" : "bg-muted/10")}
                      >
                        {isExpanded ? "Promedio de cumplimiento guardias" : "Click para expandir guardias"}
                      </td>
                    </tr>

                    {/* Guard rows (when expanded) */}
                    {isExpanded && inst.guardias.map((guardia) => {
                      const guardCells = guardia.cells.map((c) => calcCellStatus(c.digitalStatus, c.fisicaPresente));
                      const guardPercent = calcCompliancePercent(guardCells);

                      return (
                        <tr key={guardia.guardiaId} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="p-2 pl-9 sticky left-0 bg-background z-[1]">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                                avatarColor(guardPercent)
                              )}>
                                {initials(guardia.guardiaName)}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{guardia.guardiaName}</div>
                                {guardia.guardiaRut && (
                                  <div className="text-[11px] text-muted-foreground">{guardia.guardiaRut}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center p-2">
                            <span className={cn("font-bold text-xs", percentColor(guardPercent))}>{guardPercent}%</span>
                          </td>
                          {guardia.cells.map((cell, i) => {
                            const status = guardCells[i];
                            const dt = docTypes[i];
                            return (
                              <td key={dt.code} className="text-center p-1">
                                <GrillaCelda
                                  status={status}
                                  compact
                                  onClick={() =>
                                    setDrawer({
                                      open: true,
                                      docType: dt.code,
                                      docName: DOC_LABELS[dt.code] ?? dt.code,
                                      installationId: inst.installationId,
                                      installationName: inst.installationName,
                                      guardiaId: guardia.guardiaId,
                                      guardiaName: guardia.guardiaName,
                                      guardiaRut: guardia.guardiaRut,
                                      digitalStatus: cell.digitalStatus,
                                    })
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={docTypes.length + 2} className="text-center py-8 text-muted-foreground text-sm">
                    No se encontraron instalaciones
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <DocVerificacionDrawer
          open={drawer.open}
          onClose={() => setDrawer(null)}
          docName={drawer.docName}
          capa="guardia"
          installationName={drawer.installationName}
          guardiaName={drawer.guardiaName}
          guardiaRut={drawer.guardiaRut}
          digitalStatus={drawer.digitalStatus}
          obligatorioEnVisita
          guardiaDocType={drawer.docType}
          installationId={drawer.installationId}
          guardiaId={drawer.guardiaId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/docs/GrillaDocsGuardias.tsx
git commit -m "feat: add GrillaDocsGuardias accordion grid component"
```

---

## Task 12: Page + Orchestrator Component

**Files:**
- Create: `src/app/(app)/opai/documentos-operativos/page.tsx`
- Create: `src/components/docs/DocsOperativosClient.tsx`

- [ ] **Step 1: Create the client orchestrator**

Create `src/components/docs/DocsOperativosClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GrillaDocsInstalacion } from "./GrillaDocsInstalacion";
import { GrillaDocsGuardias } from "./GrillaDocsGuardias";

export function DocsOperativosClient() {
  const [tab, setTab] = useState<"instalacion" | "guardia">("instalacion");

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4">
        <button
          type="button"
          onClick={() => setTab("instalacion")}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
            tab === "instalacion"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          Por Instalación
        </button>
        <button
          type="button"
          onClick={() => setTab("guardia")}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
            tab === "guardia"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          Por Guardia
        </button>
      </div>

      {tab === "instalacion" ? <GrillaDocsInstalacion /> : <GrillaDocsGuardias />}
    </div>
  );
}
```

- [ ] **Step 2: Create the server page**

Create `src/app/(app)/opai/documentos-operativos/page.tsx`:

```tsx
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocsOperativosClient } from "@/components/docs/DocsOperativosClient";

export const metadata = { title: "Docs Operativos — OPAI" };

export default function DocsOperativosPage() {
  return (
    <div className="space-y-4">
      <DocumentosSubnav />
      <div>
        <h1 className="text-xl font-bold">Documentos Operativos</h1>
        <p className="text-sm text-muted-foreground">
          Control de cumplimiento documental digital y físico por instalación
        </p>
      </div>
      <DocsOperativosClient />
    </div>
  );
}
```

- [ ] **Step 3: Verify the page loads**

Run dev server and navigate to `/opai/documentos-operativos`. The page should render with both tabs and the installation grid.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/opai/documentos-operativos/page.tsx src/components/docs/DocsOperativosClient.tsx
git commit -m "feat: add Docs Operativos page with installation + guard grids"
```

---

## Task 13: Supervisor Mobile — Extend Step3Checklist for 3-Layer Doc Check

**Files:**
- Modify: `src/components/supervision/wizard/types.ts`
- Modify: `src/components/supervision/wizard/Step3Checklist.tsx`

- [ ] **Step 1: Add new types**

In `src/components/supervision/wizard/types.ts`, add after `DocumentCheckResult`:

```typescript
export type GuardDocCheckResult = {
  guardiaId: string;
  guardiaName: string;
  guardiaRut: string | null;
  docs: DocumentCheckResult[];
};
```

- [ ] **Step 2: Extend Step3Checklist props**

In `Step3Checklist.tsx`, add new props to the `Props` type:

```typescript
// Add to existing Props type:
  globalDocumentTypes: InstalacionDocumentType[];
  globalDocumentResults: DocumentCheckResult[];
  onGlobalDocumentResultsChange: (results: DocumentCheckResult[]) => void;
  guardDocTypes: InstalacionDocumentType[];
  guardDocResults: GuardDocCheckResult[];
  onGuardDocResultsChange: (results: GuardDocCheckResult[]) => void;
  dotacionGuards: DotacionGuard[];
```

- [ ] **Step 3: Add guard documents accordion section**

After the existing "Documentos de la Instalación" section in the JSX (which handles `documentTypes` + `documentResults`), add a new section for guard documents:

```tsx
{/* ── Documentos por Guardia ── */}
{guardDocTypes.length > 0 && dotacionGuards.length > 0 && (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Documentos por Guardia
      </CardTitle>
      <p className="text-xs text-muted-foreground">{dotacionGuards.length} guardias en turno</p>
    </CardHeader>
    <CardContent className="space-y-2">
      {dotacionGuards.map((guard) => {
        const guardResult = guardDocResults.find((r) => r.guardiaId === guard.guardId) ?? {
          guardiaId: guard.guardId,
          guardiaName: guard.guardName,
          guardiaRut: guard.guardRut,
          docs: guardDocTypes.map((dt) => ({
            code: dt.code,
            isChecked: false,
            lastEntryDate: null,
            photoFile: null,
            photoPreview: null,
            autoFindingId: null,
            autoTicketCode: null,
          })),
        };
        const checkedCount = guardResult.docs.filter((d) => d.isChecked).length;
        const isGuardExpanded = expandedGuardId === guard.guardId;

        return (
          <div key={guard.guardId} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedGuardId(isGuardExpanded ? null : guard.guardId)}
            >
              <div className="flex items-center gap-2 text-left">
                <ChevronRight className={cn("h-4 w-4 transition-transform", isGuardExpanded && "rotate-90")} />
                <div>
                  <div className="text-sm font-medium">{guard.guardName}</div>
                  {guard.guardRut && <div className="text-[11px] text-muted-foreground">{guard.guardRut}</div>}
                </div>
              </div>
              <span className={cn(
                "text-xs font-semibold",
                checkedCount === guardDocTypes.length ? "text-green-500" :
                checkedCount > 0 ? "text-amber-500" : "text-red-500"
              )}>
                {checkedCount}/{guardDocTypes.length}{checkedCount === guardDocTypes.length ? " ✓" : ""}
              </span>
            </button>
            {isGuardExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {guardDocTypes.map((dt) => {
                  const docResult = guardResult.docs.find((d) => d.code === dt.code);
                  const isChecked = docResult?.isChecked ?? false;

                  return (
                    <div
                      key={dt.code}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg",
                        isChecked ? "bg-green-500/5" : "bg-muted/20"
                      )}
                    >
                      <div className="text-xs font-medium">{dt.label}</div>
                      <div className="flex items-center gap-2">
                        {isChecked && (
                          <button
                            type="button"
                            className="w-7 h-7 rounded-md bg-green-500/15 flex items-center justify-center"
                            onClick={() => {
                              // Trigger camera for this guard doc
                              setActiveGuardDoc({ guardId: guard.guardId, code: dt.code });
                              guardDocPhotoInputRef.current?.click();
                            }}
                          >
                            {docResult?.photoPreview ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Camera className="h-3.5 w-3.5 text-green-500" />
                            )}
                          </button>
                        )}
                        {/* Toggle */}
                        <button
                          type="button"
                          className={cn(
                            "w-9 h-[22px] rounded-full relative transition-colors",
                            isChecked ? "bg-green-500" : "bg-muted-foreground/20"
                          )}
                          onClick={() => {
                            const updatedDocs = guardResult.docs.map((d) =>
                              d.code === dt.code ? { ...d, isChecked: !d.isChecked } : d
                            );
                            const updatedGuardResults = guardDocResults.map((r) =>
                              r.guardiaId === guard.guardId ? { ...r, docs: updatedDocs } : r
                            );
                            // If guard not yet in results, add them
                            if (!guardDocResults.find((r) => r.guardiaId === guard.guardId)) {
                              updatedGuardResults.push({ ...guardResult, docs: updatedDocs });
                            }
                            onGuardDocResultsChange(updatedGuardResults);
                          }}
                        >
                          <div className={cn(
                            "w-[17px] h-[17px] rounded-full bg-white absolute top-[2.5px] transition-all",
                            isChecked ? "right-[2px]" : "left-[2px]"
                          )} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Add state for guard accordion**

Add to the component's state declarations:

```typescript
const [expandedGuardId, setExpandedGuardId] = useState<string | null>(null);
const [activeGuardDoc, setActiveGuardDoc] = useState<{ guardId: string; code: string } | null>(null);
const guardDocPhotoInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 4: Add hidden file input for guard doc photos**

Add near the other hidden file inputs:

```tsx
<input
  ref={guardDocPhotoInputRef}
  type="file"
  accept="image/*"
  capture="environment"
  className="hidden"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (!file || !activeGuardDoc) return;
    const preview = URL.createObjectURL(file);
    const updatedResults = guardDocResults.map((r) => {
      if (r.guardiaId !== activeGuardDoc.guardId) return r;
      return {
        ...r,
        docs: r.docs.map((d) =>
          d.code === activeGuardDoc.code ? { ...d, photoFile: file, photoPreview: preview } : d
        ),
      };
    });
    onGuardDocResultsChange(updatedResults);
    setActiveGuardDoc(null);
    e.target.value = "";
  }}
/>
```

- [ ] **Step 5: Also merge global documents into the installation section**

The existing `documentTypes` prop handles installation-layer docs. For global docs, merge `globalDocumentTypes` into the same list displayed above the guard section. The global docs should appear first with a "(Global)" suffix in their label. Modify the mapping:

```tsx
const allInstDocs = [
  ...globalDocumentTypes.map((d) => ({ ...d, label: `${d.label} (Global)` })),
  ...documentTypes,
];
const allInstResults = [...globalDocumentResults, ...documentResults];
```

Then use `allInstDocs` and `allInstResults` in the existing document checking loop.

- [ ] **Step 6: Test the mobile flow manually**

Open the supervisor portal, start a supervision visit, navigate to Step 3. Verify:
1. Global + installation documents appear with toggle + photo.
2. Guard documents section shows accordion per guard.
3. Toggle is one-tap, photo opens camera.

- [ ] **Step 7: Commit**

```bash
git add src/components/supervision/wizard/types.ts src/components/supervision/wizard/Step3Checklist.tsx
git commit -m "feat: extend Step3Checklist with 3-layer doc verification + guard accordion"
```

---

## Task 14: Wire Supervisor — Save Verificaciones on Visit Completion

**Files:**
- Modify: The parent component that orchestrates the supervision wizard (find the component that calls Step3Checklist and handles visit save/completion)

- [ ] **Step 1: Identify the wizard orchestrator**

Search for the component that imports and renders `Step3Checklist`. This is likely in `src/components/supervision/wizard/` — the main wizard component that manages all 5 steps and handles the save/submit.

- [ ] **Step 2: Add state for new props**

In the wizard orchestrator, add state:

```typescript
const [globalDocResults, setGlobalDocResults] = useState<DocumentCheckResult[]>([]);
const [guardDocResults, setGuardDocResults] = useState<GuardDocCheckResult[]>([]);
```

- [ ] **Step 3: Fetch global doc types marked obligatorioEnVisita**

Alongside the existing fetch of `documentTypes` (installation docs), add a fetch for global doc types:

```typescript
// Fetch global doc types with obligatorioEnVisita
const globalDocTypesRes = await fetch("/api/operacional/tipos?capa=global&obligatorioEnVisita=true");
const globalDocTypes = await globalDocTypesRes.json();
```

Map these to the `InstalacionDocumentType` format:
```typescript
const globalDocumentTypes: InstalacionDocumentType[] = globalDocTypes.map((t: any) => ({
  code: t.codigo,
  label: t.nombre,
  required: t.obligatorio,
}));
```

- [ ] **Step 4: Fetch guard doc types marked obligatorioEnVisita**

```typescript
// From the guard config, filter obligatorioEnVisita
const guardConfigRes = await fetch("/api/ops/guardia-documentos-config");
const guardConfig = await guardConfigRes.json();
const guardDocTypes = guardConfig
  .filter((c: any) => c.obligatorioEnVisita)
  .map((c: any) => ({ code: c.code, label: c.label ?? c.code, required: true }));
```

- [ ] **Step 5: Pass new props to Step3Checklist**

```tsx
<Step3Checklist
  // ... existing props ...
  globalDocumentTypes={globalDocumentTypes}
  globalDocumentResults={globalDocResults}
  onGlobalDocumentResultsChange={setGlobalDocResults}
  guardDocTypes={guardDocTypes}
  guardDocResults={guardDocResults}
  onGuardDocResultsChange={setGuardDocResults}
  dotacionGuards={dotacionGuards}
/>
```

- [ ] **Step 6: On visit completion, POST verificaciones**

In the save/complete handler (when wizard finishes), add after existing save logic:

```typescript
// Collect all verificaciones
const verificaciones = [];

// Installation + Global docs
for (const result of [...globalDocResults, ...documentResults]) {
  const isGlobal = globalDocumentTypes.some((t) => t.code === result.code);
  const tipoDoc = tipoDocsByCode.get(result.code); // need to map code→tipoDocId

  verificaciones.push({
    tipoDocId: tipoDoc?.id ?? null,
    guardiaDocType: null,
    capa: isGlobal ? "global" : "instalacion",
    installationId: visit.installationId,
    guardiaId: null,
    presente: result.isChecked,
    photoUrl: result.photoPreview, // Will need actual upload URL
    notes: null,
  });
}

// Guard docs
for (const guardResult of guardDocResults) {
  for (const doc of guardResult.docs) {
    verificaciones.push({
      tipoDocId: null,
      guardiaDocType: doc.code,
      capa: "guardia",
      installationId: visit.installationId,
      guardiaId: guardResult.guardiaId,
      presente: doc.isChecked,
      photoUrl: doc.photoPreview,
      notes: null,
    });
  }
}

if (verificaciones.length > 0) {
  await fetch("/api/operacional/verificaciones-fisicas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supervisionId: visit.id,
      verificaciones,
    }),
  });
}
```

- [ ] **Step 7: Handle photo uploads**

For each verificacion with a photo file, upload to Vercel Blob before saving. Follow the existing photo upload pattern used in the supervision wizard for other photos (puesto photo, book photo, finding photos).

- [ ] **Step 8: Commit**

```bash
git add src/components/supervision/wizard/
git commit -m "feat: wire supervisor visit to save doc verificaciones on completion"
```

---

## Task 15: Integration Test + Final Verification

- [ ] **Step 1: Run all existing tests**

```bash
npx vitest run
```
Expected: All tests pass (no regressions).

- [ ] **Step 2: Run the new helper tests**

```bash
npx vitest run src/lib/__tests__/doc-verificacion-helpers.test.ts
```
Expected: All 7 tests pass.

- [ ] **Step 3: Verify Prisma schema is valid**

```bash
npx prisma validate
```
Expected: `✔ Schema is valid`

- [ ] **Step 4: Build check**

```bash
npx next build
```
Expected: Build succeeds without TypeScript errors.

- [ ] **Step 5: Manual E2E verification**

1. **Config:** Go to `/opai/configuracion/documentos-globales` → toggle "Oblig. en visita" on OS10. Go to `/opai/configuracion/ops?tab=docs-guardias` → toggle "Oblig. en visita" on Cert. OS10 and Credencial OS10.
2. **Grid view:** Navigate to `/opai/documentos-operativos` → verify installation grid shows columns for docs marked obligatorio en visita. Switch to "Por Guardia" tab → verify accordion works.
3. **Drawer:** Click a cell → drawer opens with document detail and empty history.
4. **Supervisor:** Start a supervision visit from the supervisor portal → Step 3 should show global + installation docs with toggles, and guard accordion below.
5. **Complete visit:** Toggle docs, take photos, complete visit → verificaciones saved.
6. **Grid reflects:** Go back to grid, cell should now show physical verification status. Click cell → drawer shows the verification entry.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete docs operacionales control digital + físico"
```
