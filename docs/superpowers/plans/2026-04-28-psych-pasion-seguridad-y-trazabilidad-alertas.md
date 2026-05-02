# Psych — Pasión por la seguridad + trazabilidad de alertas + mejoras de calidad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar el módulo psicolaboral a calidad de informe profesional: agregar la dimensión "Pasión por la seguridad" (vocacional, opt-in por tenant), trazabilidad granular en cada alerta (regla vs IA, ítems y respuestas que la dispararon), y correcciones de calidad del banco de ítems.

**Architecture:** Tres fases independientes y shippables. **A** introduce nueva dimensión `VOCATIONAL_FIT` con peso 0 por defecto y nueva versión del test `security-guard-v1@1.1.0` que coexiste con `1.0.0`. **B** extiende `PsychAlert` con campo `evidence` y `source`, y reorganiza UI/PDF para distinguir errores técnicos de hallazgos clínicos. **C** corrige escala LIE (asimétrica 4 vs 5), reemplaza el cognitivo trivial #38 y aumenta cobertura de Estabilidad emocional + Atención sostenida.

**Tech Stack:** Next.js App Router, Prisma + Postgres (`psych` schema), React Server Components + Client Components, `@react-pdf/renderer`, Recharts, Zod, OpenAI SDK (`gpt-4o-mini`), Vitest.

---

## Pre-requisitos / convenciones

- Cualquier cambio a `schema.prisma` exige una migración nueva en `prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/migration.sql`. Generar con `npx prisma migrate dev --name <slug>` en local; **no** editar la migración a mano salvo casos puntuales documentados.
- Después de cada cambio de schema correr `npx prisma generate` para que `@prisma/client` refleje el modelo.
- El módulo psych usa schema multi-tenant (`@@schema("psych")`). Cualquier nueva tabla/columna debe declararlo.
- Ejecutar `npx tsc --noEmit` y `npx vitest run` antes de commit.
- Commits en español, formato `feat(psych):` / `fix(psych):` siguiendo convención del repo (ver `git log --oneline -20`).
- **No** correr `prisma migrate deploy` ni `seed` automáticamente. Solo `prisma migrate dev` en local.

---

## File structure

### Files creados

- `prisma/migrations/<TS>_psych_add_weight_vocational_and_alert_evidence/migration.sql` — migración para `weight_vocational` y nada más en DB (alerts ya es Json, evidence vive ahí).
- `scripts/psych/seed-data/v1-1-items-vocational.ts` — 4 ítems vocacionales (3 SJT + 1 OPEN).
- `scripts/psych/seed-data/v1-1-items-coverage.ts` — ítems adicionales para Estabilidad emocional + Atención sostenida.
- `scripts/psych/seed-data/v1-1-items.ts` — consolidador de v1.1.0 (todo v1 corregido + cobertura + vocational).
- `scripts/psych/seed-v1-1.ts` — seed idempotente para `security-guard-v1@1.1.0`.
- `src/lib/psych/scoring/evidence.ts` — helpers que arman `evidence` por tipo de regla.
- `src/components/psych/dashboard/PsychAlertEvidence.tsx` — componente colapsable que renderiza el detalle de una alerta.
- `src/components/psych/dashboard/PsychTechnicalIssues.tsx` — bloque separado para `OPEN_ANALYSIS_FAILED` y errores de IA.
- `src/lib/psych/__tests__/alerts.test.ts` — tests unitarios de `buildAlerts` (incluye evidence).
- `src/lib/psych/__tests__/aggregate.test.ts` — tests de aggregate con peso 0 y dimensión sin ítems.

### Files modificados

- `prisma/schema.prisma:8365-8395` — TenantPsychConfig: `weightVocational Float @default(0.0)`.
- `src/lib/psych/constants.ts` — agregar `VOCATIONAL_FIT`, label "Pasión por la seguridad", `weightVocational` a `DIMENSION_WEIGHT_FIELD` y al default config (Task A1); bump `PSYCH_TEST_VERSION` a `"1.1.0"` (Task A3, junto al seed para que sea atómico).
- `src/lib/psych/types.ts` — extender `PsychAlert` con `source` (`"rule" | "ai"`) y `evidence?: PsychAlertEvidence`; tipo nuevo `PsychAlertEvidence` (unión discriminada).
- `src/lib/psych/scoring/alerts.ts` — `buildAlerts` recibe contexto extendido y rellena `evidence` en cada alerta.
- `src/lib/psych/scoring/index.ts` — pasa contexto adicional a `buildAlerts`; corrige el comentario sobre fallback 0.5 y aplica fallback real (mean 0.5, weight reducido) cuando IA falla.
- `src/lib/psych/scoring/aggregate.ts` — soporta dimensiones con weight 0 (no divide por cero, no contribuye al global).
- `src/lib/psych/scoring/detectors.ts` — `computeLieScore` con ponderación asimétrica para valor 5.
- `src/components/psych/dashboard/PsychAlertsList.tsx` — render con disclosure por alerta + badge de origen.
- `src/components/psych/dashboard/PsychAssessmentDetail.tsx` — separar `OPEN_ANALYSIS_FAILED` del bloque alertas; pasar a `PsychTechnicalIssues`.
- `src/components/psych/dashboard/PsychOpenAnalysisCard.tsx` — distinguir `error` vs `summary === ""`.
- `src/components/psych/dashboard/PsychRadarChart.tsx` — ocultar dimensión si `itemCount === 0`.
- `src/components/psych/dashboard/PsychConfigForm.tsx` — agregar slider para `weightVocational` con nota "Peso 0 = no afecta el score global".
- `src/components/psych/pdf/PsychReportPdf.tsx` — secciones separadas para alertas vs incidencias técnicas; tarjetas cualitativas distinguen error.
- `src/components/psych/review/PsychReviewReport.tsx` — mismo render condicional por `itemCount`.
- `src/app/api/psych/config/route.ts` — Zod schema acepta `weightVocational: z.number().min(0).max(3).optional()` (mínimo 0 para opt-out).
- `scripts/psych/seed-data/v1-items-cognitive.ts` — reemplazar ítem 38 por uno con discriminación real.
- `scripts/psych/seed-data/v1-items-lie-open.ts` — comentario sobre nueva ponderación en `lieKey`.
- `scripts/psych/seed-data/v1-shared.ts` — `lieKey` opcionalmente toma `weights` para 4 vs 5.

---

## Phase A — Pasión por la seguridad (dimensión opt-in)

### Task A1: Migración + constants para `VOCATIONAL_FIT`

**Files:**
- Modify: `prisma/schema.prisma:8365-8395` (TenantPsychConfig)
- Create: `prisma/migrations/<TS>_psych_add_weight_vocational/migration.sql`
- Modify: `src/lib/psych/constants.ts`

- [ ] **Step 1: Agregar columna al modelo Prisma**

Editar `prisma/schema.prisma`, en `model TenantPsychConfig` (línea 8365), agregar después de `weightResponsibility`:

```prisma
  weightVocational     Float    @default(0.0) @map("weight_vocational")
```

- [ ] **Step 2: Generar migración**

```bash
npx prisma migrate dev --name psych_add_weight_vocational
```

Expected: archivo `prisma/migrations/<TS>_psych_add_weight_vocational/migration.sql` con `ALTER TABLE "psych"."tenant_config" ADD COLUMN "weight_vocational" DOUBLE PRECISION NOT NULL DEFAULT 0;`. Cliente Prisma regenerado.

- [ ] **Step 3: Extender constants**

Modificar `src/lib/psych/constants.ts`:

```ts
export const PSYCH_DIMENSIONS = [
  "IMPULSE_CONTROL",
  "FRUSTRATION_TOLERANCE",
  "EMOTIONAL_STABILITY",
  "STRESS_MANAGEMENT",
  "SUSTAINED_ATTENTION",
  "REASONING",
  "INTEGRITY",
  "RESPONSIBILITY",
  "VOCATIONAL_FIT",
] as const;

export const PSYCH_DIMENSION_LABELS: Record<PsychDimension, string> = {
  IMPULSE_CONTROL: "Control de impulsos",
  FRUSTRATION_TOLERANCE: "Tolerancia a la frustración",
  EMOTIONAL_STABILITY: "Estabilidad emocional",
  STRESS_MANAGEMENT: "Manejo del estrés",
  SUSTAINED_ATTENTION: "Atención sostenida",
  REASONING: "Razonamiento",
  INTEGRITY: "Integridad",
  RESPONSIBILITY: "Responsabilidad",
  VOCATIONAL_FIT: "Pasión por la seguridad",
};

export const DIMENSION_WEIGHT_FIELD: Record<
  PsychDimension,
  | "weightImpulse"
  | "weightFrustration"
  | "weightStability"
  | "weightStress"
  | "weightAttention"
  | "weightReasoning"
  | "weightIntegrity"
  | "weightResponsibility"
  | "weightVocational"
> = {
  IMPULSE_CONTROL: "weightImpulse",
  FRUSTRATION_TOLERANCE: "weightFrustration",
  EMOTIONAL_STABILITY: "weightStability",
  STRESS_MANAGEMENT: "weightStress",
  SUSTAINED_ATTENTION: "weightAttention",
  REASONING: "weightReasoning",
  INTEGRITY: "weightIntegrity",
  RESPONSIBILITY: "weightResponsibility",
  VOCATIONAL_FIT: "weightVocational",
};

export const PSYCH_DEFAULT_CONFIG = {
  weights: {
    IMPULSE_CONTROL: 1.0,
    FRUSTRATION_TOLERANCE: 1.0,
    EMOTIONAL_STABILITY: 1.0,
    STRESS_MANAGEMENT: 1.0,
    SUSTAINED_ATTENTION: 1.0,
    REASONING: 1.0,
    INTEGRITY: 1.0,
    RESPONSIBILITY: 1.0,
    VOCATIONAL_FIT: 0.0,
  } as Record<PsychDimension, number>,
  thresholdFit: 80,
  thresholdCaution: 60,
  requirePsychReview: false,
  invitationTTLHours: 168,
};

// PSYCH_TEST_VERSION sigue en "1.0.0" — el bump a "1.1.0" se hace en Task A3
// junto con el seed para que cada commit sea atómico (constant + DB row juntos).
export const PSYCH_TEST_VERSION = "1.0.0";
```

- [ ] **Step 4: Verificar que typecheck pasa**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Si hay errores en otros archivos por el nuevo miembro de `PSYCH_DIMENSIONS`, déjelos pendientes — los siguientes tasks los resuelven (radar, PDF, config, etc.). Si los errores son fuera de `src/lib/psych/**`, ese es trabajo de A2/A4.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/psych/constants.ts
git commit -m "feat(psych): agregar dimensión VOCATIONAL_FIT y peso opt-in en TenantPsychConfig"
```

---

### Task A2: Aggregate tolerante a peso 0 y a dimensión sin ítems

**Files:**
- Modify: `src/lib/psych/scoring/aggregate.ts`
- Create: `src/lib/psych/__tests__/aggregate.test.ts`

- [ ] **Step 1: Test failing — peso 0 no contribuye al global**

Crear `src/lib/psych/__tests__/aggregate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateScores } from "../scoring/aggregate";
import type { ResolvedTenantPsychConfig, ScoredResponse } from "../types";

const baseConfig: ResolvedTenantPsychConfig = {
  tenantId: "t1",
  weights: {
    IMPULSE_CONTROL: 1, FRUSTRATION_TOLERANCE: 1, EMOTIONAL_STABILITY: 1,
    STRESS_MANAGEMENT: 1, SUSTAINED_ATTENTION: 1, REASONING: 1,
    INTEGRITY: 1, RESPONSIBILITY: 1, VOCATIONAL_FIT: 0,
  },
  thresholdFit: 80, thresholdCaution: 60,
  requirePsychReview: false, invitationTTLHours: 168,
  brandLogoUrl: null, brandPrimaryColor: null,
  defaultVersionCode: "security-guard-v1", defaultVersionTag: "1.1.0",
  reevaluationIntervalMonths: 6, defaultClientReportLevel: "SEAL",
};

const lowVocationalResponse: ScoredResponse = {
  itemId: "voc1", dimension: "VOCATIONAL_FIT", type: "SJT",
  normalizedScore: 0.1, weight: 1, latencyMs: 1000, minLatencyMs: 800, fastLatency: false,
};

describe("aggregateScores — peso 0 en VOCATIONAL_FIT", () => {
  it("calcula score de la dimensión pero NO la mezcla en el global", () => {
    const r = aggregateScores({
      scoredResponses: [lowVocationalResponse],
      openAnalyses: [],
      config: baseConfig,
    });
    const voc = r.dimensions.find((d) => d.dimension === "VOCATIONAL_FIT");
    expect(voc?.score).toBeCloseTo(0.1, 2);
    expect(voc?.itemCount).toBe(1);
    // Global: solo VOCATIONAL_FIT tiene response, pero peso 0 → fallback 0.5 al no haber peso
    expect(r.globalScore).toBe(50);
  });

  it("dimensión sin items reporta itemCount=0 y score 0.5", () => {
    const r = aggregateScores({
      scoredResponses: [lowVocationalResponse],
      openAnalyses: [],
      config: baseConfig,
    });
    const reasoning = r.dimensions.find((d) => d.dimension === "REASONING");
    expect(reasoning?.itemCount).toBe(0);
    expect(reasoning?.score).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run src/lib/psych/__tests__/aggregate.test.ts
```

Expected: 2 tests, ambos pueden pasar de hecho con la lógica actual *salvo* el comportamiento de peso 0. Verificar — si globalScore retorna `NaN` o número inesperado, vamos al step 3.

- [ ] **Step 3: Hardening de aggregate para peso 0 y peso negativo**

En `src/lib/psych/scoring/aggregate.ts`, dentro de `aggregateScores`, asegurar que si `tenantWeight <= 0`, la dimensión NO contribuye al numerador/denominador global:

```ts
  for (const dim of PSYCH_DIMENSIONS) {
    const rows = collectDimensionInputs(dim, scoredResponses, openAnalyses);
    const { mean, count } = weightedMean(rows);
    dimensions.push({ dimension: dim, score: mean, itemCount: count });

    const tenantWeight = config.weights[dim] ?? 1.0;
    if (tenantWeight <= 0) continue; // peso 0 = dimensión informativa, no entra al global
    globalNum += mean * tenantWeight;
    globalDen += tenantWeight;
  }
```

- [ ] **Step 4: Run tests, verify green**

```bash
npx vitest run src/lib/psych/__tests__/aggregate.test.ts
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/psych/scoring/aggregate.ts src/lib/psych/__tests__/aggregate.test.ts
git commit -m "feat(psych): aggregate ignora dimensiones con peso 0 (VOCATIONAL_FIT opt-in)"
```

---

### Task A3: Seed `security-guard-v1@1.1.0` con ítems vocacionales

**Files:**
- Create: `scripts/psych/seed-data/v1-1-items-vocational.ts`
- Create: `scripts/psych/seed-data/v1-1-items.ts`
- Create: `scripts/psych/seed-v1-1.ts`

- [ ] **Step 1: Crear ítems vocacionales (3 SJT + 1 OPEN)**

Crear `scripts/psych/seed-data/v1-1-items-vocational.ts`:

```ts
/**
 * 4 ítems VOCATIONAL_FIT (pasión por la seguridad).
 * Diseñados para evitar deseabilidad social — no preguntan "te gusta este trabajo"
 * sino qué harías ante alternativas / cómo describes el oficio.
 */

import type { OpenScoringKey } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";
import { sjt } from "./v1-items-sjt-helper";

export const ITEMS_VOCATIONAL_V1_1: SeedItem[] = [
  sjt({
    order: 46,
    dimension: "VOCATIONAL_FIT",
    prompt:
      "Te ofrecen un trabajo administrativo con sueldo similar pero sin guardia. ¿Qué haces?",
    best: "B",
    alternatives: [
      { value: "A", label: "Acepto inmediatamente, prefiero estar dentro de una oficina.", score: 0.1 },
      { value: "B", label: "Lo evalúo, pero me gusta el trabajo de seguridad porque siento que aporto al cuidado de las personas; me quedo si las condiciones son comparables.", score: 1.0 },
      { value: "C", label: "Dejo guardia sin pensarlo, todo trabajo de oficina es mejor.", score: 0.0 },
      { value: "D", label: "Acepto y trabajo en ambos por un tiempo mientras decido.", score: 0.4 },
    ],
  }),
  sjt({
    order: 47,
    dimension: "VOCATIONAL_FIT",
    prompt:
      "En tu primera semana descubres que el rol exige más estudio del que pensabas (protocolos, primeros auxilios, defensa personal). ¿Cómo lo tomas?",
    best: "A",
    alternatives: [
      { value: "A", label: "Me motiva, prefiero estar bien preparado para situaciones reales.", score: 1.0 },
      { value: "B", label: "Lo hago porque toca, aunque preferiría menos teoría.", score: 0.5 },
      { value: "C", label: "Estudio lo mínimo para aprobar y pasar el curso.", score: 0.2 },
      { value: "D", label: "Renuncio, era para algo más simple.", score: 0.0 },
    ],
  }),
  sjt({
    order: 48,
    dimension: "VOCATIONAL_FIT",
    prompt:
      "Un familiar te dice que ser guardia 'es trabajo de poco valor'. ¿Cómo respondes?",
    best: "C",
    alternatives: [
      { value: "A", label: "Le doy la razón, es un trabajo más mientras encuentro otra cosa.", score: 0.1 },
      { value: "B", label: "Le digo que no opine si no sabe.", score: 0.3 },
      { value: "C", label: "Le explico que ser guardia significa proteger personas, prevenir delitos y mantener la calma cuando otros pierden el control — es un oficio con responsabilidad real.", score: 1.0 },
      { value: "D", label: "No le respondo y cambio de tema.", score: 0.4 },
    ],
  }),
  {
    order: 49,
    type: "OPEN",
    dimension: "VOCATIONAL_FIT",
    prompt:
      "Cuéntanos en tus palabras qué te llevó a postular como guardia y qué es lo que más valoras del oficio. ¿Te imaginas haciendo esto en 5 años? (mínimo 4 líneas, ~120 palabras)",
    options: null,
    scoringKey: {
      kind: "open",
      rubric: "ai_analysis",
      dimensions: ["VOCATIONAL_FIT"],
    } satisfies OpenScoringKey,
    weight: 1.5,
    minLatencyMs: 30_000,
    maxLatencyMs: 600_000,
  },
];
```

- [ ] **Step 2: Crear consolidador v1.1**

Crear `scripts/psych/seed-data/v1-1-items.ts`:

```ts
/**
 * Consolida los 49 ítems del test security-guard-v1.1.0.
 * = 45 ítems v1.0.0 + 4 ítems VOCATIONAL_FIT.
 */

import { ITEMS_LIKERT } from "./v1-items-likert";
import { ITEMS_SJT_A } from "./v1-items-sjt-a";
import { ITEMS_SJT_B } from "./v1-items-sjt-b";
import { ITEMS_COGNITIVE } from "./v1-items-cognitive";
import { ITEMS_LIE_OPEN } from "./v1-items-lie-open";
import { ITEMS_VOCATIONAL_V1_1 } from "./v1-1-items-vocational";
import type { SeedItem } from "./v1-shared";

export const ITEMS_V1_1: SeedItem[] = [
  ...ITEMS_LIKERT,
  ...ITEMS_SJT_A,
  ...ITEMS_SJT_B,
  ...ITEMS_COGNITIVE,
  ...ITEMS_LIE_OPEN,
  ...ITEMS_VOCATIONAL_V1_1,
];

if (ITEMS_V1_1.length !== 49) {
  throw new Error(
    `Seed security-guard-v1.1.0 debe tener 49 items, encontrados ${ITEMS_V1_1.length}`,
  );
}

const orders = new Set<number>();
for (const item of ITEMS_V1_1) {
  if (orders.has(item.order)) {
    throw new Error(`Order duplicado en seed: ${item.order}`);
  }
  orders.add(item.order);
}
```

- [ ] **Step 3: Crear seed script**

Crear `scripts/psych/seed-v1-1.ts`:

```ts
/**
 * Seed idempotente del test "security-guard-v1@1.1.0".
 *
 * Uso:
 *   npx tsx scripts/psych/seed-v1-1.ts
 *
 * No toca v1.0.0 — crea/actualiza versión 1.1.0 con 49 items.
 */

import { PrismaClient, type PsychItemType } from "@prisma/client";
import { PSYCH_TEST_CODE } from "@/lib/psych/constants";
import { ITEMS_V1_1 } from "./seed-data/v1-1-items";

const VERSION = "1.1.0";
const prisma = new PrismaClient();

async function main() {
  console.log(
    `[psych-seed] Seeding ${PSYCH_TEST_CODE}@${VERSION} (${ITEMS_V1_1.length} items)`,
  );

  const version = await prisma.psychTestVersion.upsert({
    where: { code_version: { code: PSYCH_TEST_CODE, version: VERSION } },
    create: {
      code: PSYCH_TEST_CODE,
      version: VERSION,
      name: "Test psicolaboral — Guardia de Seguridad v1.1",
      description:
        "v1.1: agrega dimensión VOCATIONAL_FIT (Pasión por la seguridad), corrige cobertura y escala LIE asimétrica.",
      isActive: true,
    },
    update: {
      name: "Test psicolaboral — Guardia de Seguridad v1.1",
      isActive: true,
    },
  });
  console.log(`[psych-seed] ✔ upsert version id=${version.id}`);

  const deleted = await prisma.psychItem.deleteMany({
    where: { versionId: version.id },
  });
  console.log(`[psych-seed] deleted ${deleted.count} items previos`);

  let created = 0;
  for (const item of ITEMS_V1_1) {
    await prisma.psychItem.create({
      data: {
        versionId: version.id,
        order: item.order,
        type: item.type as PsychItemType,
        dimension: item.dimension,
        prompt: item.prompt,
        options: item.options as never,
        scoringKey: item.scoringKey as never,
        reverseScore: item.reverseScore ?? false,
        weight: item.weight ?? 1.0,
        minLatencyMs: item.minLatencyMs ?? 800,
        maxLatencyMs: item.maxLatencyMs ?? 120_000,
      },
    });
    created += 1;
  }
  console.log(`[psych-seed] ✔ ${created} items insertados`);
}

main()
  .catch((err) => {
    console.error("[psych-seed] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Ejecutar seed local**

```bash
npx tsx scripts/psych/seed-v1-1.ts
```

Expected output:
```
[psych-seed] Seeding security-guard-v1@1.1.0 (49 items)
[psych-seed] ✔ upsert version id=...
[psych-seed] deleted 0 items previos
[psych-seed] ✔ 49 items insertados
```

- [ ] **Step 5: Actualizar AI prompt para incluir VOCATIONAL_FIT**

Modificar `src/lib/psych/ai/analyzeOpen.ts`. En `SYSTEM_PROMPT` (línea ~21) reemplazar el bloque de dimensiones permitidas:

```ts
const SYSTEM_PROMPT = `Eres un psicólogo laboral especializado en selección de personal de seguridad privada en Chile. Analizas la respuesta escrita de un candidato a un escenario laboral. Devuelves JSON estricto con:
{
  "dimensionScores": { "IMPULSE_CONTROL": number 0-1, "STRESS_MANAGEMENT": number 0-1, "VOCATIONAL_FIT": number 0-1 },
  "markers": string[],
  "summary": string,
  "flags": string[]
}

Reglas:
- Devuelve sólo las dimensiones que correspondan al escenario (las que vienen en input.dimensions).
- NO diagnostiques (no uses términos DSM/CIE).
- NO juzgues. Describe en lenguaje técnico.
- Para VOCATIONAL_FIT: evalúa identificación con el rol, motivación intrínseca, proyección a futuro y comprensión del oficio. Penaliza respuestas con marcadores de "es solo un trabajo más" o instrumentales puros (solo por dinero / solo mientras encuentro otra cosa).
- Si la respuesta es muy corta (<20 palabras) o incoherente, usa flag "RED_FLAG_INCOHERENT" y baja todos los scores.
- Si detectas lenguaje agresivo o uso de violencia como primera respuesta, flag "RED_FLAG_AGGRESSION" y IMPULSE_CONTROL ≤ 0.3.
- markers: máx 5, en español; summary máx 600 caracteres; flags máx 3.
- Responde SOLO JSON válido, sin markdown ni texto adicional.`;
```

- [ ] **Step 6: Bump PSYCH_TEST_VERSION a "1.1.0"**

Editar `src/lib/psych/constants.ts`. Reemplazar:

```ts
// PSYCH_TEST_VERSION sigue en "1.0.0" — el bump a "1.1.0" se hace en Task A3
// junto con el seed para que cada commit sea atómico (constant + DB row juntos).
export const PSYCH_TEST_VERSION = "1.0.0";
```

por:

```ts
export const PSYCH_TEST_VERSION = "1.1.0";
```

(Eliminar el comentario explicativo, ya cumplió su rol). El bump aquí es seguro porque la versión 1.1.0 ya existe en BD tras correr el seed en Step 4.

- [ ] **Step 7: Commit**

```bash
git add scripts/psych/seed-data/v1-1-items-vocational.ts scripts/psych/seed-data/v1-1-items.ts scripts/psych/seed-v1-1.ts src/lib/psych/ai/analyzeOpen.ts src/lib/psych/constants.ts
git commit -m "feat(psych): seed security-guard-v1@1.1.0 con 4 items VOCATIONAL_FIT"
```

---

### Task A4: UI — slider, radar y PDF tolerantes a la nueva dimensión

**Files:**
- Modify: `src/components/psych/dashboard/PsychConfigForm.tsx`
- Modify: `src/components/psych/dashboard/PsychRadarChart.tsx`
- Modify: `src/components/psych/pdf/PsychReportPdf.tsx`
- Modify: `src/components/psych/review/PsychReviewReport.tsx`
- Modify: `src/app/api/psych/config/route.ts`

- [ ] **Step 1: Zod schema acepta `weightVocational` con mínimo 0**

En `src/app/api/psych/config/route.ts:14-36`, dentro de `PatchSchema`, agregar:

```ts
  weightVocational: z.number().min(0).max(3).optional(),
```

(nota: `min(0)` en lugar de `min(0.1)` porque queremos permitir desactivarla por completo).

- [ ] **Step 2: PsychConfigForm — agregar campo y nota**

En `src/components/psych/dashboard/PsychConfigForm.tsx`:

a. Agregar `weightVocational: number;` a la interfaz `ConfigShape` (línea 11).
b. En el `setCfg({...})` del useEffect (línea 37) agregar:
```ts
            weightVocational: c.weights.VOCATIONAL_FIT ?? 0,
```
c. Justo después del bloque `<section>` "Pesos por dimensión" (después de línea 105), agregar nota informativa:

```tsx
        <p className="text-xs text-muted-foreground mt-3">
          <strong>Pasión por la seguridad</strong>: peso 0 mantiene la dimensión
          como informativa (se reporta pero no afecta el puntaje global). Súbelo
          si quieres priorizar candidatos con vocación de servicio.
        </p>
```

d. En el slider del map (línea ~92), bajar `min={0.5}` a `min={0}` para que VOCATIONAL_FIT pueda llegar a 0:

```tsx
                <input
                  type="range"
                  min={dim === "VOCATIONAL_FIT" ? 0 : 0.5}
                  max={2.0}
                  step={0.1}
                  value={value}
                  onChange={(e) => setWeight(dim, Number(e.target.value))}
                />
```

- [ ] **Step 3: Radar oculta dimensión sin ítems**

En `src/components/psych/dashboard/PsychRadarChart.tsx:33-37`, filtrar:

```tsx
  const data = PSYCH_DIMENSIONS
    .filter((dim) => (dimensionScores[dim]?.itemCount ?? 0) > 0)
    .map((dim) => ({
      dimension: PSYCH_DIMENSION_LABELS[dim as PsychDimension],
      score: Math.round((dimensionScores[dim]?.score ?? 0) * 100),
      threshold: thresholdFit,
    }));
```

- [ ] **Step 4: PDF — render condicional por itemCount + sección vocacional aparte**

En `src/components/psych/pdf/PsychReportPdf.tsx:83-97`, reemplazar el map de dimensiones para que filtre por itemCount y separe `VOCATIONAL_FIT` debajo de las demás:

```tsx
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Perfil por dimensión</Text>
          {PSYCH_DIMENSIONS.filter(
            (dim) =>
              dim !== "VOCATIONAL_FIT" &&
              (props.dimensionScores[dim]?.itemCount ?? 0) > 0,
          ).map((dim) => {
            const s = props.dimensionScores[dim]?.score ?? 0;
            const pct = Math.round(s * 100);
            return (
              <View key={dim} style={styles.bar}>
                <View style={styles.barLabel}>
                  <Text>{PSYCH_DIMENSION_LABELS[dim as PsychDimension]}</Text>
                  <Text>{pct}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={{ ...styles.barFill, width: `${pct}%` }} />
                </View>
              </View>
            );
          })}
        </View>

        {(props.dimensionScores.VOCATIONAL_FIT?.itemCount ?? 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ajuste vocacional (informativo)</Text>
            <View style={styles.bar}>
              <View style={styles.barLabel}>
                <Text>Pasión por la seguridad</Text>
                <Text>{Math.round((props.dimensionScores.VOCATIONAL_FIT.score ?? 0) * 100)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={{ ...styles.barFill, width: `${Math.round((props.dimensionScores.VOCATIONAL_FIT.score ?? 0) * 100)}%`, backgroundColor: "#16a34a" }} />
              </View>
            </View>
          </View>
        ) : null}
```

- [ ] **Step 5: PsychReviewReport — mismo filtro**

En `src/components/psych/review/PsychReviewReport.tsx:46`, agregar filtro:

```tsx
        {PSYCH_DIMENSIONS.filter(
          (dim) => (result.dimensionScores[dim]?.itemCount ?? 0) > 0,
        ).map((dim) => {
```

- [ ] **Step 6: Verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/psych/dashboard/PsychConfigForm.tsx src/components/psych/dashboard/PsychRadarChart.tsx src/components/psych/pdf/PsychReportPdf.tsx src/components/psych/review/PsychReviewReport.tsx src/app/api/psych/config/route.ts
git commit -m "feat(psych): UI tolera VOCATIONAL_FIT y dimensiones sin items (legacy results)"
```

---

## Phase B — Trazabilidad de alertas (evidence)

### Task B1: Tipos extendidos para `PsychAlert.evidence` y `source`

**Files:**
- Modify: `src/lib/psych/types.ts`

- [ ] **Step 1: Definir union discriminada de evidence + ampliar PsychAlert**

En `src/lib/psych/types.ts`, reemplazar la definición actual de `PsychAlert` (línea ~76) por:

```ts
export type PsychAlertSource = "rule" | "ai";

export type PsychAlertEvidence =
  | {
      kind: "low_dimension";
      threshold: number;
      observed: number;
      worstItems: Array<{
        itemId: string;
        order: number;
        prompt: string;
        response: unknown;
        normalizedScore: number;
      }>;
    }
  | {
      kind: "high_lie";
      threshold: number;
      observed: number;
      hits: Array<{
        itemId: string;
        order: number;
        prompt: string;
        value: number; // 4 o 5
      }>;
    }
  | {
      kind: "straight_lining";
      threshold: number;
      observedStd: number;
      mean: number;
      sequence: Array<{ order: number; value: number }>;
    }
  | {
      kind: "fast_latency";
      threshold: number;
      observedRatio: number;
      fastItems: Array<{
        itemId: string;
        order: number;
        prompt: string;
        latencyMs: number;
        minLatencyMs: number;
      }>;
    }
  | {
      kind: "ai_red_flag";
      itemId: string;
      order: number;
      prompt: string;
      response: string;
      summary: string;
      markers: string[];
      flag: string; // RED_FLAG_AGGRESSION etc.
    }
  | {
      kind: "ai_failure";
      itemId: string;
      order: number;
      prompt: string;
      errorMessage: string;
    };

export interface PsychAlert {
  code: PsychFlag | string;
  severity: "info" | "warning" | "critical";
  message: string;
  dimension?: PsychDimension;
  source: PsychAlertSource;
  evidence?: PsychAlertEvidence;
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: ahora `buildAlerts` (alerts.ts) tendrá errores porque no rellena `source`. Los resolveremos en B2.

- [ ] **Step 3: Commit**

```bash
git add src/lib/psych/types.ts
git commit -m "feat(psych): extender PsychAlert con source + evidence (trazabilidad)"
```

---

### Task B2: `buildAlerts` rellena evidence

**Files:**
- Create: `src/lib/psych/scoring/evidence.ts`
- Modify: `src/lib/psych/scoring/alerts.ts`
- Modify: `src/lib/psych/scoring/index.ts`
- Modify: `src/lib/psych/scoring/prepare.ts`
- Create: `src/lib/psych/__tests__/alerts.test.ts`

- [ ] **Step 1: Helpers de evidence**

Crear `src/lib/psych/scoring/evidence.ts`:

```ts
/**
 * Helpers para construir el campo `evidence` de cada PsychAlert.
 * Mantiene `alerts.ts` legible y el formato es contrato público (UI lo renderiza).
 */

import type {
  PsychAlertEvidence,
  ScoredResponse,
} from "../types";
import type { LikertSample } from "./detectors";
import type { LoadedAssessmentItem } from "./prepare";

export function lowDimensionEvidence(
  dim: string,
  score: number,
  scored: ScoredResponse[],
  items: Map<string, LoadedAssessmentItem>,
  responses: Map<string, unknown>,
): PsychAlertEvidence {
  const dimResponses = scored
    .filter((r) => r.dimension === dim)
    .sort((a, b) => a.normalizedScore - b.normalizedScore)
    .slice(0, 3)
    .map((r) => {
      const item = items.get(r.itemId);
      return {
        itemId: r.itemId,
        order: item?.order ?? 0,
        prompt: item?.prompt ?? "",
        response: responses.get(r.itemId),
        normalizedScore: r.normalizedScore,
      };
    });
  return {
    kind: "low_dimension",
    threshold: 0.5,
    observed: score,
    worstItems: dimResponses,
  };
}

export function highLieEvidence(
  lieScore: number,
  hits: Array<{ itemId: string; value: number }>,
  items: Map<string, LoadedAssessmentItem>,
): PsychAlertEvidence {
  return {
    kind: "high_lie",
    threshold: 0.6,
    observed: lieScore,
    hits: hits.map((h) => {
      const item = items.get(h.itemId);
      return {
        itemId: h.itemId,
        order: item?.order ?? 0,
        prompt: item?.prompt ?? "",
        value: h.value,
      };
    }),
  };
}

export function straightLiningEvidence(
  samples: LikertSample[],
): PsychAlertEvidence {
  const n = samples.length;
  const mean = samples.reduce((a, s) => a + s.value, 0) / Math.max(n, 1);
  const variance =
    samples.reduce((a, s) => a + Math.pow(s.value - mean, 2), 0) /
    Math.max(n, 1);
  const std = Math.sqrt(variance);
  return {
    kind: "straight_lining",
    threshold: 0.5,
    observedStd: std,
    mean,
    sequence: samples.map((s) => ({ order: s.itemOrder, value: s.value })),
  };
}

export function fastLatencyEvidence(
  rows: Array<{ itemId: string; latencyMs: number | null; minLatencyMs: number }>,
  items: Map<string, LoadedAssessmentItem>,
): PsychAlertEvidence {
  const fast = rows.filter(
    (r) => r.latencyMs != null && r.latencyMs < r.minLatencyMs,
  );
  return {
    kind: "fast_latency",
    threshold: 0.3,
    observedRatio: rows.length > 0 ? fast.length / rows.length : 0,
    fastItems: fast.map((r) => {
      const item = items.get(r.itemId);
      return {
        itemId: r.itemId,
        order: item?.order ?? 0,
        prompt: item?.prompt ?? "",
        latencyMs: r.latencyMs ?? 0,
        minLatencyMs: r.minLatencyMs,
      };
    }),
  };
}
```

- [ ] **Step 2: Modificar `buildAlerts` para aceptar contexto y emitir evidence**

Reescribir `src/lib/psych/scoring/alerts.ts`:

```ts
/**
 * Construye PsychAlert[] a partir del scoring + evidence trazable.
 * Cada alerta lleva `source: "rule" | "ai"` y `evidence` que la UI renderiza
 * en disclosure colapsable.
 */

import {
  PSYCH_DIMENSION_LABELS,
  PSYCH_FLAGS,
  type PsychDimension,
} from "../constants";
import type {
  DimensionScore,
  OpenAnalysisResult,
  PsychAlert,
  ScoredResponse,
} from "../types";
import type { LikertSample } from "./detectors";
import type { LoadedAssessmentItem } from "./prepare";
import {
  fastLatencyEvidence,
  highLieEvidence,
  lowDimensionEvidence,
  straightLiningEvidence,
} from "./evidence";

interface AlertInput {
  dimensions: DimensionScore[];
  openAnalyses: OpenAnalysisResult[];
  lieScore: number;
  lieHits: Array<{ itemId: string; value: number }>;
  straightLining: boolean;
  likertSamples: LikertSample[];
  fastLatency: boolean;
  latencyRows: Array<{ itemId: string; latencyMs: number | null; minLatencyMs: number }>;
  scoredResponses: ScoredResponse[];
  items: Map<string, LoadedAssessmentItem>;
  responsesById: Map<string, unknown>;
}

export function buildAlerts(input: AlertInput): PsychAlert[] {
  const alerts: PsychAlert[] = [];

  for (const d of input.dimensions) {
    if (d.itemCount === 0) continue; // dimensión no evaluada → no alertas
    if (d.score < 0.3) {
      alerts.push({
        code: `LOW_${d.dimension}`,
        severity: "critical",
        message: `${PSYCH_DIMENSION_LABELS[d.dimension as PsychDimension] ?? d.dimension}: puntaje muy bajo (${Math.round(d.score * 100)}).`,
        dimension: d.dimension as PsychDimension,
        source: "rule",
        evidence: lowDimensionEvidence(
          d.dimension,
          d.score,
          input.scoredResponses,
          input.items,
          input.responsesById,
        ),
      });
    } else if (d.score < 0.5) {
      alerts.push({
        code: `LOW_${d.dimension}`,
        severity: "warning",
        message: `${PSYCH_DIMENSION_LABELS[d.dimension as PsychDimension] ?? d.dimension}: puntaje bajo (${Math.round(d.score * 100)}).`,
        dimension: d.dimension as PsychDimension,
        source: "rule",
        evidence: lowDimensionEvidence(
          d.dimension,
          d.score,
          input.scoredResponses,
          input.items,
          input.responsesById,
        ),
      });
    }
  }

  if (input.lieScore >= 0.6) {
    alerts.push({
      code: PSYCH_FLAGS.HIGH_LIE,
      severity: "warning",
      message: `Escala de mentira elevada (${Math.round(input.lieScore * 100)}%). Posible deseabilidad social — tomar con cautela.`,
      source: "rule",
      evidence: highLieEvidence(input.lieScore, input.lieHits, input.items),
    });
  }

  if (input.straightLining) {
    alerts.push({
      code: PSYCH_FLAGS.STRAIGHT_LINING,
      severity: "warning",
      message:
        "Patrón de respuesta uniforme (straight-lining): el evaluado marcó siempre la misma casilla en Likert.",
      source: "rule",
      evidence: straightLiningEvidence(input.likertSamples),
    });
  }

  if (input.fastLatency) {
    alerts.push({
      code: PSYCH_FLAGS.FAST_LATENCY,
      severity: "info",
      message:
        "Respuestas más rápidas que la latencia mínima esperada — revisar nivel de atención aplicado.",
      source: "rule",
      evidence: fastLatencyEvidence(input.latencyRows, input.items),
    });
  }

  for (const open of input.openAnalyses) {
    const item = input.items.get(open.itemId);
    if (open.error) {
      alerts.push({
        code: PSYCH_FLAGS.OPEN_ANALYSIS_FAILED,
        severity: "info",
        message: `Análisis IA no disponible para pregunta abierta: ${open.error}`,
        source: "ai",
        evidence: {
          kind: "ai_failure",
          itemId: open.itemId,
          order: item?.order ?? 0,
          prompt: item?.prompt ?? "",
          errorMessage: open.error,
        },
      });
      continue;
    }
    for (const flag of open.flags) {
      if (flag.startsWith("RED_FLAG_")) {
        const responseText =
          (input.responsesById.get(open.itemId) as { value?: string })?.value ??
          (input.responsesById.get(open.itemId) as string) ??
          "";
        alerts.push({
          code: flag,
          severity: "critical",
          message: `Pregunta abierta (${item?.order ?? open.itemId}): ${flag.replace("RED_FLAG_", "").toLowerCase()}.`,
          source: "ai",
          evidence: {
            kind: "ai_red_flag",
            itemId: open.itemId,
            order: item?.order ?? 0,
            prompt: item?.prompt ?? "",
            response: typeof responseText === "string" ? responseText : "",
            summary: open.summary,
            markers: open.markers,
            flag,
          },
        });
      }
    }
  }

  return alerts;
}
```

- [ ] **Step 3: prepare.ts expone latencyRows con itemId y lieHits**

Modificar `src/lib/psych/scoring/prepare.ts`. En `PreparedBuckets`:

```ts
export interface PreparedBuckets {
  scoredResponses: ScoredResponse[];
  likertSamples: LikertSample[];
  lieInputs: Array<{ value: unknown; extremeValues: number[] }>;
  lieHits: Array<{ itemId: string; value: number }>;
  latencyRows: Array<{ itemId: string; latencyMs: number | null; minLatencyMs: number }>;
  openToAnalyze: OpenToAnalyze[];
  responsesById: Map<string, unknown>;
}
```

Y dentro de `prepareBuckets`, donde construye `out`, inicializar `lieHits: []`, `responsesById: new Map()`. Reemplazar el push de `latencyRows` para incluir `itemId`:

```ts
    out.latencyRows.push({
      itemId: item.id,
      latencyMs: resp.latencyMs,
      minLatencyMs: item.minLatencyMs,
    });
    out.responsesById.set(item.id, resp.value);
```

Y donde maneja `LIE` (línea ~120), agregar tracking de hits:

```ts
    if (item.type === "LIE") {
      const key = item.scoringKey as { extremePositiveValues?: number[] };
      const extreme = key.extremePositiveValues ?? [4, 5];
      out.lieInputs.push({ value: resp.value, extremeValues: extreme });
      const v = Number(
        (resp.value as { value?: unknown })?.value ?? resp.value,
      );
      if (Number.isFinite(v) && extreme.includes(v)) {
        out.lieHits.push({ itemId: item.id, value: v });
      }
    }
```

- [ ] **Step 4: Modificar `detectors.detectFastLatency` para aceptar el nuevo tipo de filas**

En `src/lib/psych/scoring/detectors.ts:46-58`:

```ts
export function detectFastLatency(
  rows: Array<{ latencyMs: number | null; minLatencyMs: number }>,
  threshold = 0.3,
): boolean {
```

(no cambia la firma porque acepta objetos con esos dos campos — el nuevo `itemId` es opcional vía structural typing, no rompe).

- [ ] **Step 5: Pasar contexto a `buildAlerts` desde scoring/index.ts**

En `src/lib/psych/scoring/index.ts`, reemplazar la llamada a `buildAlerts` (alrededor de línea 90):

```ts
  const alerts: PsychAlert[] = buildAlerts({
    dimensions,
    openAnalyses,
    lieScore,
    lieHits: buckets.lieHits,
    straightLining,
    likertSamples: buckets.likertSamples,
    fastLatency,
    latencyRows: buckets.latencyRows,
    scoredResponses: buckets.scoredResponses,
    items: itemsMap,
    responsesById: buckets.responsesById,
  });
```

- [ ] **Step 6: Test unitario para evidence**

Crear `src/lib/psych/__tests__/alerts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAlerts } from "../scoring/alerts";
import type { LoadedAssessmentItem } from "../scoring/prepare";

const item = (
  id: string,
  order: number,
  type: LoadedAssessmentItem["type"],
  dimension: string,
  prompt = "",
): LoadedAssessmentItem => ({
  id, order, type, dimension, prompt, scoringKey: {},
  reverseScore: false, weight: 1, minLatencyMs: 800,
});

describe("buildAlerts — evidence", () => {
  it("HIGH_LIE incluye los items que dispararon", () => {
    const items = new Map<string, LoadedAssessmentItem>();
    items.set("lie1", item("lie1", 39, "LIE", "LIE", "Nunca he mentido"));
    items.set("lie2", item("lie2", 40, "LIE", "LIE", "Siempre devuelvo"));
    items.set("lie3", item("lie3", 41, "LIE", "LIE", "Jamás he sentido rabia"));

    const alerts = buildAlerts({
      dimensions: [],
      openAnalyses: [],
      lieScore: 0.6,
      lieHits: [
        { itemId: "lie1", value: 5 },
        { itemId: "lie2", value: 4 },
        { itemId: "lie3", value: 5 },
      ],
      straightLining: false,
      likertSamples: [],
      fastLatency: false,
      latencyRows: [],
      scoredResponses: [],
      items,
      responsesById: new Map(),
    });

    const lie = alerts.find((a) => a.code === "HIGH_LIE");
    expect(lie?.source).toBe("rule");
    expect(lie?.evidence?.kind).toBe("high_lie");
    if (lie?.evidence?.kind === "high_lie") {
      expect(lie.evidence.hits).toHaveLength(3);
      expect(lie.evidence.hits[0].order).toBe(39);
      expect(lie.evidence.hits[0].value).toBe(5);
    }
  });

  it("OPEN_ANALYSIS_FAILED tiene source ai y evidence ai_failure", () => {
    const items = new Map<string, LoadedAssessmentItem>();
    items.set("o44", item("o44", 44, "OPEN", "IMPULSE_CONTROL", "Cuéntame..."));

    const alerts = buildAlerts({
      dimensions: [],
      openAnalyses: [
        {
          itemId: "o44",
          dimensionScores: null,
          markers: [],
          summary: "",
          flags: [],
          error: "Request was aborted",
        },
      ],
      lieScore: 0,
      lieHits: [],
      straightLining: false,
      likertSamples: [],
      fastLatency: false,
      latencyRows: [],
      scoredResponses: [],
      items,
      responsesById: new Map(),
    });

    const fail = alerts.find((a) => a.code === "OPEN_ANALYSIS_FAILED");
    expect(fail?.source).toBe("ai");
    expect(fail?.evidence?.kind).toBe("ai_failure");
    if (fail?.evidence?.kind === "ai_failure") {
      expect(fail.evidence.errorMessage).toBe("Request was aborted");
      expect(fail.evidence.order).toBe(44);
    }
  });
});
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/lib/psych/__tests__/alerts.test.ts
```

Expected: 2 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/psych/scoring/evidence.ts src/lib/psych/scoring/alerts.ts src/lib/psych/scoring/index.ts src/lib/psych/scoring/prepare.ts src/lib/psych/__tests__/alerts.test.ts
git commit -m "feat(psych): buildAlerts rellena evidence trazable con items y respuestas"
```

---

### Task B3: UI — disclosure y separación errores técnicos

**Files:**
- Create: `src/components/psych/dashboard/PsychAlertEvidence.tsx`
- Create: `src/components/psych/dashboard/PsychTechnicalIssues.tsx`
- Modify: `src/components/psych/dashboard/PsychAlertsList.tsx`
- Modify: `src/components/psych/dashboard/PsychAssessmentDetail.tsx`
- Modify: `src/components/psych/dashboard/PsychOpenAnalysisCard.tsx`

- [ ] **Step 1: Componente colapsable de evidencia**

Crear `src/components/psych/dashboard/PsychAlertEvidence.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PsychAlertEvidence as Evidence } from "@/lib/psych/types";

const LIKERT_LABELS: Record<number, string> = {
  1: "Muy en desacuerdo",
  2: "En desacuerdo",
  3: "Neutro",
  4: "De acuerdo",
  5: "Muy de acuerdo",
};

export default function PsychAlertEvidence({ evidence }: { evidence?: Evidence }) {
  const [open, setOpen] = useState(false);
  if (!evidence) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-foreground/70 hover:text-foreground flex items-center gap-1"
      >
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Ocultar evidencia" : "Ver evidencia"}
      </button>
      {open ? (
        <div className="mt-2 rounded-md bg-muted/30 p-3 text-xs text-foreground/90 space-y-2">
          {renderEvidence(evidence)}
        </div>
      ) : null}
    </div>
  );
}

function renderEvidence(e: Evidence) {
  switch (e.kind) {
    case "low_dimension":
      return (
        <div>
          <p className="font-medium mb-1">
            Puntaje {Math.round(e.observed * 100)} / 100 (umbral {Math.round(e.threshold * 100)}).
            Items que más bajaron la dimensión:
          </p>
          <ul className="space-y-1.5">
            {e.worstItems.map((it) => (
              <li key={it.itemId} className="border-l-2 border-amber-500/30 pl-2">
                <p className="text-foreground/70">#{it.order} — {it.prompt}</p>
                <p>Respuesta: {formatResponse(it.response)} → {Math.round(it.normalizedScore * 100)}/100</p>
              </li>
            ))}
          </ul>
        </div>
      );
    case "high_lie":
      return (
        <div>
          <p className="font-medium mb-1">
            {e.hits.length} de los items LIE marcados con valor extremo (4 o 5).
            Umbral: {Math.round(e.threshold * 100)}%, observado: {Math.round(e.observed * 100)}%.
          </p>
          <ul className="space-y-1.5">
            {e.hits.map((h) => (
              <li key={h.itemId} className="border-l-2 border-amber-500/30 pl-2">
                <p className="text-foreground/70">#{h.order} — {h.prompt}</p>
                <p>Respuesta: <strong>{LIKERT_LABELS[h.value] ?? h.value}</strong></p>
              </li>
            ))}
          </ul>
        </div>
      );
    case "straight_lining":
      return (
        <div>
          <p className="font-medium mb-1">
            Desviación estándar {e.observedStd.toFixed(2)} (umbral &lt; {e.threshold}).
            Media: {e.mean.toFixed(2)}.
          </p>
          <p className="text-foreground/70">
            Secuencia Likert: {e.sequence.map((s) => s.value).join(", ")}
          </p>
        </div>
      );
    case "fast_latency":
      return (
        <div>
          <p className="font-medium mb-1">
            {Math.round(e.observedRatio * 100)}% de respuestas bajo el mínimo esperado
            (umbral {Math.round(e.threshold * 100)}%).
          </p>
          <ul className="space-y-1.5">
            {e.fastItems.slice(0, 5).map((it) => (
              <li key={it.itemId}>
                #{it.order}: {it.latencyMs}ms (mínimo {it.minLatencyMs}ms)
              </li>
            ))}
          </ul>
        </div>
      );
    case "ai_red_flag":
      return (
        <div>
          <p className="font-medium mb-1">
            Pregunta abierta #{e.order}: {e.prompt}
          </p>
          <div className="border-l-2 border-red-500/40 pl-2 my-1">
            <p className="text-foreground/70 text-[11px]">Respuesta del candidato:</p>
            <p>"{e.response}"</p>
          </div>
          {e.summary ? <p className="text-foreground/70 italic">IA: {e.summary}</p> : null}
          {e.markers.length > 0 ? (
            <p className="text-foreground/70">Marcadores: {e.markers.join(", ")}</p>
          ) : null}
        </div>
      );
    case "ai_failure":
      return (
        <div>
          <p className="font-medium mb-1">
            Error en análisis IA del item #{e.order}.
          </p>
          <p className="text-foreground/70">{e.errorMessage}</p>
          <p className="text-[11px] text-foreground/60 mt-1">
            Esto no es una alerta sobre el candidato. Reintentar con "Recalcular".
          </p>
        </div>
      );
  }
}

function formatResponse(r: unknown): string {
  if (r == null) return "—";
  if (typeof r === "string") return r;
  if (typeof r === "number") return String(r);
  if (typeof r === "object" && "value" in r) {
    const v = (r as { value: unknown }).value;
    if (typeof v === "number" && LIKERT_LABELS[v]) return LIKERT_LABELS[v];
    return String(v);
  }
  return JSON.stringify(r);
}
```

- [ ] **Step 2: Componente para errores técnicos**

Crear `src/components/psych/dashboard/PsychTechnicalIssues.tsx`:

```tsx
"use client";

import type { PsychAlert } from "@/lib/psych/types";
import PsychAlertEvidence from "./PsychAlertEvidence";

export default function PsychTechnicalIssues({
  alerts,
  onRescore,
}: {
  alerts: PsychAlert[];
  onRescore?: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
      <h3 className="font-semibold text-foreground mb-2">Calidad técnica</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Estas incidencias son fallas técnicas (timeouts, cuotas API), no
        observaciones del candidato. Reintenta con "Recalcular" si el servicio
        ya está disponible.
      </p>
      <ul className="space-y-2">
        {alerts.map((a, i) => (
          <li key={`${a.code}-${i}`} className="border-l-2 border-amber-500/40 pl-3">
            <p className="text-foreground/90">{a.message}</p>
            <PsychAlertEvidence evidence={a.evidence} />
          </li>
        ))}
      </ul>
      {onRescore ? (
        <button
          onClick={onRescore}
          className="mt-3 text-xs rounded-md border border-border px-2.5 py-1.5"
        >
          Recalcular
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: PsychAlertsList con evidence + badge de origen**

Reescribir `src/components/psych/dashboard/PsychAlertsList.tsx`:

```tsx
"use client";

import type { PsychAlert } from "@/lib/psych/types";
import PsychAlertEvidence from "./PsychAlertEvidence";

const SEVERITY_CLS: Record<string, string> = {
  info: "bg-muted/50 text-foreground/90 border-border",
  warning:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  critical:
    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const SEVERITY_ICON: Record<string, string> = {
  info: "ℹ",
  warning: "⚠",
  critical: "🛑",
};

const SOURCE_LABEL: Record<string, string> = {
  rule: "Regla del test",
  ai: "Análisis IA",
};

export default function PsychAlertsList({ alerts }: { alerts: PsychAlert[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin alertas detectadas.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li
          key={`${a.code}-${i}`}
          className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_CLS[a.severity] ?? SEVERITY_CLS.info}`}
        >
          <div className="flex gap-2 items-start">
            <span aria-hidden>{SEVERITY_ICON[a.severity] ?? "•"}</span>
            <div className="flex-1">
              <p>{a.message}</p>
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                {SOURCE_LABEL[a.source] ?? a.source}
              </span>
            </div>
          </div>
          <PsychAlertEvidence evidence={a.evidence} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: PsychAssessmentDetail separa OPEN_ANALYSIS_FAILED**

En `src/components/psych/dashboard/PsychAssessmentDetail.tsx`, después del bloque que arma `result` (línea ~95), partir alerts en dos:

```tsx
  const allAlerts = result.alerts ?? [];
  const technicalAlerts = allAlerts.filter((a) => a.code === "OPEN_ANALYSIS_FAILED");
  const candidateAlerts = allAlerts.filter((a) => a.code !== "OPEN_ANALYSIS_FAILED");
```

Pasar `candidateAlerts` a `PsychAssessmentScoreCard` (línea 105):

```tsx
          alerts={candidateAlerts}
```

Y agregar al final del `<div className="lg:order-1 ...">` (después del bloque `openAnalysis`):

```tsx
        <PsychTechnicalIssues alerts={technicalAlerts} onRescore={handleRescore} />
```

E importar arriba:

```tsx
import PsychTechnicalIssues from "./PsychTechnicalIssues";
```

- [ ] **Step 5: PsychOpenAnalysisCard distingue error real**

Reescribir `src/components/psych/dashboard/PsychOpenAnalysisCard.tsx`:

```tsx
"use client";

import type { OpenAnalysisResult } from "@/lib/psych/types";

export default function PsychOpenAnalysisCard({
  entry,
}: {
  entry: OpenAnalysisResult;
}) {
  if (entry.error) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium text-foreground/90">
          Análisis cualitativo pendiente
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          La IA no pudo procesar esta respuesta. Detalle técnico: {entry.error}
        </p>
      </div>
    );
  }
  if (!entry.summary) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        La IA no detectó marcadores relevantes en esta respuesta.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm text-foreground leading-relaxed">{entry.summary}</p>
      {entry.markers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.markers.map((m) => (
            <span key={m} className="text-xs px-2 py-1 rounded-md bg-muted text-foreground/90">
              {m}
            </span>
          ))}
        </div>
      ) : null}
      {entry.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.flags.map((f) => (
            <span key={f} className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 font-medium">
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: PDF — separar errores técnicos y distinguir vacío de error**

En `src/components/psych/pdf/PsychReportPdf.tsx`:

a. Después de `BAND_LABEL` agregar split de alerts:

```tsx
function splitAlerts(alerts: PsychAlert[]) {
  const tech = alerts.filter((a) => a.code === "OPEN_ANALYSIS_FAILED");
  const candidate = alerts.filter((a) => a.code !== "OPEN_ANALYSIS_FAILED");
  return { tech, candidate };
}
```

b. Reemplazar el render de `props.openAnalysis.map` (línea ~103) para distinguir error vs summary vacío:

```tsx
        {props.openAnalysis.length > 0 ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionTitle}>Análisis cualitativo</Text>
            {props.openAnalysis.map((o) => {
              if (o.error) {
                return (
                  <View key={o.itemId} style={[styles.openBox, { backgroundColor: "#fef3c7" }]}>
                    <Text>Análisis pendiente — error técnico de IA. Reintentar.</Text>
                  </View>
                );
              }
              if (!o.summary) {
                return (
                  <View key={o.itemId} style={styles.openBox}>
                    <Text>La IA no detectó marcadores relevantes.</Text>
                  </View>
                );
              }
              return (
                <View key={o.itemId} style={styles.openBox}>
                  <Text>{o.summary}</Text>
                  {o.markers.length > 0 ? (
                    <Text style={styles.subtitle}>Marcadores: {o.markers.join(", ")}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
```

c. Reemplazar el render de alerts (línea ~115):

```tsx
        {(() => {
          const { tech, candidate } = splitAlerts(props.alerts);
          return (
            <>
              {candidate.length > 0 ? (
                <View style={styles.section} wrap>
                  <Text style={styles.sectionTitle}>Alertas</Text>
                  {candidate.map((a, i) => (
                    <View
                      key={`${a.code}-${i}`}
                      style={a.severity === "critical" ? { ...styles.alertRow, ...styles.alertCritical } : styles.alertRow}
                    >
                      <Text>{a.message}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {tech.length > 0 ? (
                <View style={styles.section} wrap>
                  <Text style={styles.sectionTitle}>Calidad técnica</Text>
                  {tech.map((a, i) => (
                    <View key={`${a.code}-${i}`} style={styles.alertRow}>
                      <Text>{a.message}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          );
        })()}
```

- [ ] **Step 7: Verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/psych/dashboard/PsychAlertEvidence.tsx src/components/psych/dashboard/PsychTechnicalIssues.tsx src/components/psych/dashboard/PsychAlertsList.tsx src/components/psych/dashboard/PsychAssessmentDetail.tsx src/components/psych/dashboard/PsychOpenAnalysisCard.tsx src/components/psych/pdf/PsychReportPdf.tsx
git commit -m "feat(psych): UI/PDF muestran evidence por alerta y separan errores técnicos"
```

---

## Phase C — Calidad del banco de ítems

### Task C1: LIE asimétrica (5 pesa más que 4)

**Files:**
- Modify: `scripts/psych/seed-data/v1-shared.ts`
- Modify: `src/lib/psych/scoring/detectors.ts`
- Modify: `src/lib/psych/types.ts`

- [ ] **Step 1: Tipo extendido para LieScoringKey**

En `src/lib/psych/types.ts`, modificar `LieScoringKey`:

```ts
export interface LieScoringKey {
  kind: "lie";
  /** Map "valor → peso 0..1" para inflación de la escala. Si falta, fallback {4: 1, 5: 1}. */
  weights?: Record<number, number>;
  /** Compatibilidad con v1.0.0 — valores que cuentan como hit binario. */
  extremePositiveValues: number[];
}
```

- [ ] **Step 2: detectFastLatency / computeLieScore con ponderación**

En `src/lib/psych/scoring/detectors.ts`, reescribir `computeLieScore`:

```ts
export interface LieInput {
  value: unknown;
  extremeValues: number[];
  weights?: Record<number, number>;
}

export function computeLieScore(inputs: LieInput[]): number {
  if (inputs.length === 0) return 0;
  let acc = 0;
  for (const inp of inputs) {
    const v = extractLikertValue(inp.value);
    if (v == null) continue;
    if (inp.weights) {
      acc += inp.weights[v] ?? 0;
    } else if (inp.extremeValues.includes(v)) {
      acc += 1;
    }
  }
  return acc / inputs.length;
}
```

- [ ] **Step 3: Helper `lieKey` admite weights**

En `scripts/psych/seed-data/v1-shared.ts`, reemplazar:

```ts
export function lieKey(
  weights: Record<number, number> = { 4: 0.5, 5: 1.0 },
): LieScoringKey {
  // Asimétrico por defecto: "Muy de acuerdo" pesa el doble que "De acuerdo".
  // Esto evita que respuestas moderadamente deseables se vean iguales que mentiras descaradas.
  return {
    kind: "lie",
    weights,
    extremePositiveValues: [4, 5], // compat con detector v1
  };
}
```

- [ ] **Step 4: prepare.ts pasa weights al detector**

En `src/lib/psych/scoring/prepare.ts`, donde maneja LIE, agregar weights:

```ts
    if (item.type === "LIE") {
      const key = item.scoringKey as { extremePositiveValues?: number[]; weights?: Record<number, number> };
      const extreme = key.extremePositiveValues ?? [4, 5];
      out.lieInputs.push({
        value: resp.value,
        extremeValues: extreme,
        weights: key.weights,
      });
      // ...resto igual
    }
```

- [ ] **Step 5: Test ponderación**

Agregar a `src/lib/psych/__tests__/alerts.test.ts` (o crear `detectors.test.ts`):

```ts
import { computeLieScore } from "../scoring/detectors";

describe("computeLieScore — asimétrico", () => {
  it("valor 5 pesa el doble que valor 4 con default weights", () => {
    const all5 = computeLieScore([
      { value: 5, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
      { value: 5, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
    ]);
    const all4 = computeLieScore([
      { value: 4, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
      { value: 4, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
    ]);
    expect(all5).toBe(1.0);
    expect(all4).toBe(0.5);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/lib/psych/__tests__/
```

Expected: todos PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/psych/scoring/detectors.ts src/lib/psych/scoring/prepare.ts src/lib/psych/types.ts scripts/psych/seed-data/v1-shared.ts src/lib/psych/__tests__/
git commit -m "feat(psych): LIE scale asimétrica (Muy de acuerdo pesa 2x que De acuerdo)"
```

---

### Task C2: Reemplazar cognitivo trivial #38

**Files:**
- Modify: `scripts/psych/seed-data/v1-items-cognitive.ts`

- [ ] **Step 1: Reemplazar item 38 por uno con discriminación real**

En `scripts/psych/seed-data/v1-items-cognitive.ts`, reemplazar el objeto `order: 38` por:

```ts
  {
    order: 38,
    type: "COGNITIVE",
    dimension: "SUSTAINED_ATTENTION",
    prompt:
      "Memoriza esta secuencia: 5-9-2-7-3-1-8. ¿Qué número está exactamente entre el 2 y el 1?",
    options: opts(["7-3", "9-7", "3-8", "Sólo el 7 o el 3"]),
    scoringKey: cogKey("A"),
    weight: 1.2,
    minLatencyMs: 4_000,
    maxLatencyMs: 60_000,
  },
```

- [ ] **Step 2: Re-seed v1.1**

```bash
npx tsx scripts/psych/seed-v1-1.ts
```

Expected: 49 items insertados, sin errores.

- [ ] **Step 3: Commit**

```bash
git add scripts/psych/seed-data/v1-items-cognitive.ts
git commit -m "fix(psych): item cognitivo #38 con discriminación real (no trivial)"
```

---

### Task C3: Cobertura adicional — Estabilidad emocional + Atención sostenida

**Files:**
- Create: `scripts/psych/seed-data/v1-1-items-coverage.ts`
- Modify: `scripts/psych/seed-data/v1-1-items.ts`

- [ ] **Step 1: 4 ítems extra de cobertura**

Crear `scripts/psych/seed-data/v1-1-items-coverage.ts`:

```ts
/**
 * Ítems de cobertura v1.1 para dimensiones con n<5 en v1.0.0.
 * - 2 SJT EMOTIONAL_STABILITY (de 3 → 5)
 * - 1 SJT + 1 COGNITIVE SUSTAINED_ATTENTION (de 3 → 5, con segundo cognitivo no trivial)
 */

import type { CognitiveScoringKey, SjtOption } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";
import { sjt } from "./v1-items-sjt-helper";

const opts = (labels: string[]): SjtOption[] =>
  labels.map((label, i) => ({ value: String.fromCharCode(65 + i), label }));

const cogKey = (correct: string): CognitiveScoringKey => ({
  kind: "cognitive",
  correctValue: correct,
});

export const ITEMS_COVERAGE_V1_1: SeedItem[] = [
  sjt({
    order: 50,
    dimension: "EMOTIONAL_STABILITY",
    prompt:
      "Te enteras en pleno turno de que tu pareja terminó la relación por mensaje. ¿Cómo manejas el resto del turno?",
    best: "B",
    alternatives: [
      { value: "A", label: "Pido reemplazo de inmediato porque no puedo concentrarme.", score: 0.3 },
      { value: "B", label: "Termino el turno de forma segura, postergo lo personal y avisó al supervisor para conversarlo después.", score: 1.0 },
      { value: "C", label: "Sigo distraído usando el celular para resolver la situación.", score: 0.1 },
      { value: "D", label: "Abandono el puesto.", score: 0.0 },
    ],
  }),
  sjt({
    order: 51,
    dimension: "EMOTIONAL_STABILITY",
    prompt:
      "Un residente te insulta por motivos personales que nada tienen que ver con tu trabajo. Después se va. ¿Cómo sigues tu jornada?",
    best: "A",
    alternatives: [
      { value: "A", label: "Respiro, dejo registro del incidente y sigo con normalidad.", score: 1.0 },
      { value: "B", label: "Quedo molesto pero igual cumplo, evitando interactuar con todos.", score: 0.5 },
      { value: "C", label: "Le respondo en privado más tarde por redes sociales.", score: 0.0 },
      { value: "D", label: "Le aviso a otros guardias para que también lo traten mal.", score: 0.0 },
    ],
  }),
  sjt({
    order: 52,
    dimension: "SUSTAINED_ATTENTION",
    prompt:
      "Llevas 4 horas vigilando 12 monitores de cámara. Notas que en la cámara 7 hay una persona desde hace 20 minutos sin moverse. ¿Qué haces?",
    best: "C",
    alternatives: [
      { value: "A", label: "Probablemente está esperando a alguien, sigo con la ronda visual.", score: 0.2 },
      { value: "B", label: "Llamo a un compañero para que vaya a verificar y sigo en otra cámara.", score: 0.6 },
      { value: "C", label: "Hago zoom, registro la observación con hora, intento contacto por interfono y aviso al supervisor si no responde.", score: 1.0 },
      { value: "D", label: "Espero otros 10 minutos antes de actuar.", score: 0.3 },
    ],
  }),
  {
    order: 53,
    type: "COGNITIVE",
    dimension: "SUSTAINED_ATTENTION",
    prompt:
      "Lee con atención: 'El vehículo placa BCDF-12 ingresó a las 14:35, salió a las 15:48, y volvió a las 17:02 con dos pasajeros distintos.' ¿Cuántos minutos estuvo dentro la primera vez?",
    options: opts(["73 minutos", "1 hora 13 minutos", "1 hora 8 minutos", "67 minutos"]),
    scoringKey: cogKey("B"),
    weight: 1.2,
    minLatencyMs: 5_000,
    maxLatencyMs: 90_000,
  },
];
```

- [ ] **Step 2: Incluir en consolidador v1.1**

Modificar `scripts/psych/seed-data/v1-1-items.ts`:

```ts
import { ITEMS_COVERAGE_V1_1 } from "./v1-1-items-coverage";

export const ITEMS_V1_1: SeedItem[] = [
  ...ITEMS_LIKERT,
  ...ITEMS_SJT_A,
  ...ITEMS_SJT_B,
  ...ITEMS_COGNITIVE,
  ...ITEMS_LIE_OPEN,
  ...ITEMS_COVERAGE_V1_1,
  ...ITEMS_VOCATIONAL_V1_1,
];

if (ITEMS_V1_1.length !== 53) {
  throw new Error(
    `Seed security-guard-v1.1.0 debe tener 53 items, encontrados ${ITEMS_V1_1.length}`,
  );
}
```

- [ ] **Step 3: Re-seed**

```bash
npx tsx scripts/psych/seed-v1-1.ts
```

Expected: 53 items insertados, sin errores.

- [ ] **Step 4: Commit**

```bash
git add scripts/psych/seed-data/v1-1-items-coverage.ts scripts/psych/seed-data/v1-1-items.ts
git commit -m "feat(psych): v1.1 amplía cobertura de Estabilidad emocional y Atención sostenida"
```

---

## Tarea final — verificación end-to-end

### Task F1: Smoke test manual + typecheck + tests

- [ ] **Step 1: Typecheck completo**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Tests unitarios psych**

```bash
npx vitest run src/lib/psych/__tests__/
```

Expected: todos PASS.

- [ ] **Step 3: Build local**

```bash
npm run build
```

Expected: build successful.

- [ ] **Step 4: Smoke browser**

```bash
npm run dev:watch:turbo
```

Verificar manualmente:
1. `/opai/configuracion` → módulo psicolaboral → aparece slider "Pasión por la seguridad" con valor 0.0 y nota explicativa.
2. Subir el slider a 1.0 y guardar.
3. Crear evaluación → completar como tester (o usar fixture existente) → ver detalle.
4. Detalle muestra dimensión "Pasión por la seguridad" en radar (si la versión asignada es 1.1.0).
5. Cada alerta muestra badge "Regla del test" o "Análisis IA" + botón "Ver evidencia" expandible.
6. Si IA falla, "OPEN_ANALYSIS_FAILED" aparece en bloque "Calidad técnica" separado, no en "Alertas".
7. Descargar PDF: secciones "Alertas" y "Calidad técnica" están separadas; "Análisis cualitativo" distingue error vs vacío.

- [ ] **Step 5: Tag commit final**

```bash
git tag -a psych-v1.1.0 -m "Psych v1.1.0: VOCATIONAL_FIT + alert evidence + LIE asimétrica + cobertura"
```

(no push del tag salvo solicitud explícita).

---

## Self-review checklist

- [x] Cobertura del spec: dimensión vocacional ✓ (A1-A4), trazabilidad de alertas ✓ (B1-B3), separar OPEN_ANALYSIS_FAILED ✓ (B3), distinguir error vs vacío en cualitativo ✓ (B3 step 5+6), LIE asimétrica ✓ (C1), cognitivo trivial reemplazado ✓ (C2), cobertura mejorada ✓ (C3).
- [x] Sin placeholders.
- [x] Tipos consistentes: `PsychAlert.evidence` referenciado igual en types.ts y consumido en evidence.ts, alerts.ts, PsychAlertEvidence.tsx.
- [x] Cada cambio de schema lleva su migración.
- [x] Cada feature tiene test unitario donde aplica (aggregate, alerts, computeLieScore).

---

## Riesgos y notas

- **Compatibilidad legacy:** los assessments scoreados con v1.0.0 no tienen `source` ni `evidence` en sus alertas — el render trata ambos campos como opcionales (`a.source ?? "rule"` en UI), así que no rompen.
- **Re-score:** si un tenant quiere actualizar un assessment v1.0.0 a v1.1.0, NO se hace por re-score — exige nueva evaluación porque cambian los items respondidos. El botón "Recalcular" sólo recalcula con los items respondidos originales.
- **Cuota OpenAI:** la nueva pregunta abierta vocacional (#49) suma una llamada a IA por evaluación. Si el tenant tiene cuota apretada, esto incrementa OPEN_ANALYSIS_FAILED.
- **Multi-tenant rollout:** cambiar `PSYCH_TEST_VERSION` en constants no migra tenants existentes (defaultVersionTag persistido sigue siendo "1.0.0"). Se necesitará un script o opción en UI para que cada tenant elija upgrade. Fuera de este plan.
