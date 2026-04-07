# Rondas UX Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix portal guardia bugs (tolerance, incidents) and refactor configuration UX to be intuitive for non-technical users.

**Architecture:** Client-side fixes for portal grouping logic, full-screen modal for incidents, inline descriptions replacing tooltips, edit forms for templates/programaciones, auto-generation of executions on programación create, and a new `instrucciones` field on checkpoints.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, Prisma ORM, PostgreSQL (Neon)

---

### Task 1: Fix tolerance/atrasada classification in MisRondas

**Files:**
- Modify: `src/components/portal/rondas/MisRondas.tsx:212-228`

**Step 1: Fix the grouping logic**

In `MisRondas.tsx`, the `useMemo` at line 205 groups pendiente rondas. Currently line 217-224:

```typescript
} else if (r.status === "pendiente") {
  const scheduledMs = new Date(r.scheduledAt).getTime();
  const toleranceMs = (r.toleranciaMinutos ?? 10) * 60000;
  if (now >= scheduledMs - toleranceMs) {
    listas.push(r);
  } else {
    proximas.push(r);
  }
}
```

Replace with:

```typescript
} else if (r.status === "pendiente") {
  const scheduledMs = new Date(r.scheduledAt).getTime();
  const toleranceMs = (r.toleranciaMinutos ?? 10) * 60000;
  if (now > scheduledMs + toleranceMs) {
    // Past due: scheduled time + tolerance window has passed
    atrasadas.push(r);
  } else if (now >= scheduledMs - toleranceMs) {
    // Within tolerance window: ready to start
    listas.push(r);
  } else {
    // Future: not yet within tolerance window
    proximas.push(r);
  }
}
```

**Step 2: Verify locally**

Open `http://localhost:3000/portal/rondas`, login with RUT 13.255.838-8 / PIN 3499. Rondas at 10:00, 12:00, 14:00 should show as ATRASADAS (red). The 16:00 ronda behavior depends on current time.

**Step 3: Commit**

```bash
git add src/components/portal/rondas/MisRondas.tsx
git commit -m "fix(rondas): separate atrasadas from listas using tolerance window"
```

---

### Task 2: Make ReportarIncidente a full-screen modal

**Files:**
- Modify: `src/components/portal/rondas/ReportarIncidente.tsx:185-191`

**Step 1: Change the outer container**

At line 185, the current outer div is:
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
```

Replace with:
```tsx
<div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
```

And the inner container at line 191:
```tsx
<div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-zinc-900 p-5 space-y-5">
```

Replace with:
```tsx
<div className="flex-1 overflow-y-auto p-5 pb-safe">
  <div className="mx-auto w-full max-w-md space-y-5">
```

Add a sticky header with close button at the top of the inner content:
```tsx
<div className="sticky top-0 z-10 flex items-center justify-between bg-black/90 pb-3">
  <h2 className="text-xl font-bold text-white">Reportar Incidente</h2>
  <button onClick={onClose} className="rounded-lg bg-zinc-800 p-2 text-gray-400 hover:bg-zinc-700">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>
</div>
```

Close the extra div before the component's closing tags.

**Step 2: Verify locally**

Start a ronda, tap "Reportar Incidente". Modal should cover entire screen with dark background, scrollable content, X button to close.

**Step 3: Commit**

```bash
git add src/components/portal/rondas/ReportarIncidente.tsx
git commit -m "fix(rondas): make incident modal full-screen overlay above map"
```

---

### Task 3: Add `instrucciones` field to checkpoints

**Files:**
- Modify: `prisma/schema.prisma` — OpsCheckpoint model (~line 3030)
- Create: new migration
- Modify: `src/app/api/ops/rondas/checkpoints/route.ts` — accept field in POST/PATCH
- Modify: `src/components/ops/rondas/CheckpointMapCreator.tsx` — add textarea
- Modify: `src/app/api/portal/rondas/mis-rondas/route.ts` — return field
- Modify: `src/components/portal/rondas/CheckpointMarker.tsx` — show instructions

**Step 1: Add field to Prisma schema**

In `prisma/schema.prisma`, after `description` field (line 3030), add:

```prisma
  instrucciones  String?  @map("instrucciones")
```

**Step 2: Create and run migration**

```bash
npx prisma migrate dev --name add_checkpoint_instrucciones
```

**Step 3: Update checkpoint API POST handler**

In `src/app/api/ops/rondas/checkpoints/route.ts`, update the validation schema (in `src/lib/validations/rondas.ts` if that's where `checkpointSchema` lives) to accept `instrucciones: z.string().optional()`. Include it in the `create` data.

**Step 4: Update CheckpointMapCreator form**

In `src/components/ops/rondas/CheckpointMapCreator.tsx`, after the critical checkbox (~line 556), add a textarea:

```tsx
<div className="space-y-1">
  <label className="text-xs font-medium text-muted-foreground">
    Instrucciones para el guardia
  </label>
  <textarea
    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm resize-none"
    rows={3}
    placeholder="Ej: Verificar que la puerta esté cerrada. Revisar cámara #3."
    value={instrucciones}
    onChange={(e) => setInstrucciones(e.target.value)}
    maxLength={500}
  />
  <p className="text-[10px] text-muted-foreground">
    El guardia verá estas instrucciones al marcar este checkpoint.
  </p>
</div>
```

Add `instrucciones` state and include it in the submit payload.

**Step 5: Return instrucciones in portal API**

In `src/app/api/portal/rondas/mis-rondas/route.ts`, in the template checkpoint select (line 20), add `instrucciones: true`.

**Step 6: Show in CheckpointMarker bottom sheet**

In `src/components/portal/rondas/CheckpointMarker.tsx`, near the top of the bottom sheet content, if `instrucciones` exists, show:

```tsx
{checkpoint.instrucciones && (
  <div className="rounded-lg bg-blue-950/30 border border-blue-800/30 p-3 mb-3">
    <p className="text-xs font-medium text-blue-400 mb-1">Instrucciones</p>
    <p className="text-sm text-gray-300">{checkpoint.instrucciones}</p>
  </div>
)}
```

**Step 7: Commit**

```bash
git add prisma/ src/
git commit -m "feat(rondas): add instrucciones field to checkpoints, visible in guard portal"
```

---

### Task 4: Replace tooltips with inline descriptions in forms

**Files:**
- Modify: `src/components/ops/rondas/programacion-form.tsx:82-106`
- Modify: `src/components/ops/rondas/ronda-template-form.tsx:138-172`

**Step 1: Update programacion-form.tsx**

Replace the frecuencia label+tooltip (~line 82-85):
```tsx
<label className="text-[11px] text-muted-foreground flex items-center gap-1" title="...">
  Frecuencia (min)
  <span className="cursor-help text-muted-foreground/60">&#9432;</span>
</label>
```

With:
```tsx
<label className="text-[11px] text-muted-foreground">Frecuencia (min)</label>
```

After the Input for frecuencia, add:
```tsx
<p className="text-[10px] text-muted-foreground/80 mt-0.5">
  Cada cuántos minutos se genera una ronda. Ej: 120 = cada 2 horas.
</p>
```

Same for tolerancia (~line 95-98):
```tsx
<label className="text-[11px] text-muted-foreground">Tolerancia (min)</label>
```

After its Input:
```tsx
<p className="text-[10px] text-muted-foreground/80 mt-0.5">
  Minutos antes de la hora en que el guardia puede iniciar. Pasado este margen, se marca atrasada.
</p>
```

**Step 2: Update ronda-template-form.tsx**

In the order mode select, add description below:
```tsx
<p className="text-[10px] text-muted-foreground/80 mt-0.5">
  Flexible: checkpoints en cualquier orden. Secuencial: deben seguirse en orden.
</p>
```

In the estimated duration field, add:
```tsx
<p className="text-[10px] text-muted-foreground/80 mt-0.5">
  Tiempo aproximado en minutos. "Auto" calcula 8 min por checkpoint.
</p>
```

**Step 3: Commit**

```bash
git add src/components/ops/rondas/programacion-form.tsx src/components/ops/rondas/ronda-template-form.tsx
git commit -m "ux(rondas): replace tooltips with inline descriptions in config forms"
```

---

### Task 5: Add template editing UI

**Files:**
- Modify: `src/components/ops/rondas/ronda-template-form.tsx` — add edit mode
- Modify: `src/components/ops/rondas/RondasConfiguracionClient.tsx:291-331` — add edit button + state

**Step 1: Add edit mode to RondaTemplateForm**

Add optional `editingTemplate` prop to the form. When provided, pre-fill all fields:

```tsx
interface Props {
  installationId: string;
  checkpoints: { id: string; name: string }[];
  onSubmit: (payload: RondaTemplatePayload) => Promise<void> | void;
  editingTemplate?: {
    id: string;
    name: string;
    description?: string;
    orderMode: string;
    estimatedDurationMin?: number;
    checkpoints: { checkpointId: string; orderIndex: number }[];
  } | null;
  onCancelEdit?: () => void;
}
```

Initialize state from `editingTemplate` when provided. Change submit button text to "Guardar cambios" when editing. Add "Cancelar" button when editing.

**Step 2: Add edit button + state in RondasConfiguracionClient**

Add `editingTemplate` state. When "Editar" is clicked on a template card, set `editingTemplate` to that template's data. Pass it to `RondaTemplateForm`. On submit, call PATCH `/api/ops/rondas/templates/[id]` instead of POST.

Add "Editar" button before "Eliminar" in each template card (~line 319):

```tsx
<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingTemplate(tpl)}>
  Editar
</Button>
```

**Step 3: Commit**

```bash
git add src/components/ops/rondas/ronda-template-form.tsx src/components/ops/rondas/RondasConfiguracionClient.tsx
git commit -m "feat(rondas): add template editing UI using existing PATCH API"
```

---

### Task 6: Add programación editing UI + remove "Generar 24h"

**Files:**
- Modify: `src/components/ops/rondas/programacion-form.tsx` — add edit mode
- Modify: `src/components/ops/rondas/RondasConfiguracionClient.tsx:111-189` — edit button, remove "Generar 24h"

**Step 1: Add edit mode to ProgramacionForm**

Add optional `editingProgramacion` prop:

```tsx
interface Props {
  templates: { id: string; name: string }[];
  onSubmit: (payload: ProgramacionPayload) => Promise<void> | void;
  editingProgramacion?: {
    id: string;
    rondaTemplateId: string;
    diasSemana: number[];
    horaInicio: string;
    horaFin: string;
    frecuenciaMinutos: number;
    toleranciaMinutos: number;
  } | null;
  onCancelEdit?: () => void;
}
```

Initialize state from `editingProgramacion`. Show "Guardar cambios" / "Cancelar" when editing.

**Step 2: Update RondasConfiguracionClient**

- Add `editingProgramacion` state
- In the actions column (~line 150-189), **remove the "Generar 24h" button** (lines 156-172)
- Add "Editar" button that sets `editingProgramacion`
- On edit submit, call PATCH `/api/ops/rondas/programacion/[id]`

**Step 3: Commit**

```bash
git add src/components/ops/rondas/programacion-form.tsx src/components/ops/rondas/RondasConfiguracionClient.tsx
git commit -m "feat(rondas): add programacion editing, remove confusing 'Generar 24h' button"
```

---

### Task 7: Auto-generate executions when creating programación

**Files:**
- Modify: `src/app/api/ops/rondas/programacion/route.ts:53-67` — add auto-generation after create

**Step 1: Add auto-generation logic**

After the `prisma.opsRondaProgramacion.create()` call (line 53-65), if `isActive` is true, auto-generate:

```typescript
// Auto-generate executions for today + tomorrow so guards see rondas immediately
if (parsed.data.isActive) {
  const now = new Date();
  const from = startOfDayChile(now);
  const to = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h to cover today + tomorrow

  const template = await prisma.opsRondaTemplate.findFirst({
    where: { id: parsed.data.rondaTemplateId },
    include: { checkpoints: true },
  });

  if (template) {
    const slots = buildScheduleSlots({
      from,
      to,
      diasSemana: parsed.data.diasSemana,
      horaInicio: parsed.data.horaInicio,
      horaFin: parsed.data.horaFin,
      frecuenciaMinutos: parsed.data.frecuenciaMinutos,
    });

    if (slots.length > 0) {
      const rows = await Promise.all(
        slots.map(async (scheduledAt) => {
          const assignment = await resolveOnDutyGuardiaForInstallation({
            tenantId: ctx.tenantId,
            installationId: template.installationId,
            scheduledAt,
          });
          return {
            tenantId: ctx.tenantId,
            rondaTemplateId: template.id,
            programacionId: row.id,
            guardiaId: assignment.guardiaId,
            status: "pendiente",
            scheduledAt,
            checkpointsTotal: template.checkpoints.length,
            checkpointsCompletados: 0,
            porcentajeCompletado: 0,
            trustScore: 0,
          };
        }),
      );
      await prisma.opsRondaEjecucion.createMany({ data: rows, skipDuplicates: true });
    }
  }
}
```

Add imports at top:
```typescript
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";
import { resolveOnDutyGuardiaForInstallation } from "@/lib/rondas/guardia-assignment";
import { startOfDayChile } from "@/lib/rondas/timezone";
```

**Step 2: Verify**

Create a new programación in config. Then open portal — rondas should appear immediately without clicking anything.

**Step 3: Commit**

```bash
git add src/app/api/ops/rondas/programacion/route.ts
git commit -m "feat(rondas): auto-generate executions when creating active programacion"
```

---

### Task 8: Installation summary panel in configuration

**Files:**
- Modify: `src/components/ops/rondas/RondasConfiguracionClient.tsx:220-230` — add summary above tabs

**Step 1: Add summary component**

After the ChipTabs (line 225) and before the loading/tab-content section (line 227), add a summary panel:

```tsx
{!loading && installationId && (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="flex items-center gap-6 text-sm">
      <span className="flex items-center gap-1.5">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <strong>{checkpoints.filter(c => c.isActive).length}</strong> checkpoints
      </span>
      <span className="flex items-center gap-1.5">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <strong>{templates.length}</strong> plantillas
      </span>
      <span className="flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <strong>{programaciones.filter(p => p.isActive).length}</strong> programaciones activas
      </span>
    </div>
    {checkpoints.length === 0 && templates.length === 0 && programaciones.length === 0 && (
      <div className="mt-3 rounded-lg bg-blue-950/20 border border-blue-800/30 p-3">
        <p className="text-sm text-blue-300">
          <strong>¿Primera vez?</strong> Configura rondas en 3 pasos:
        </p>
        <ol className="mt-1.5 text-xs text-blue-300/80 list-decimal list-inside space-y-0.5">
          <li>Crea <strong>checkpoints</strong> (puntos de control en el mapa)</li>
          <li>Arma una <strong>plantilla</strong> con los checkpoints a recorrer</li>
          <li>Define la <strong>programación</strong> (días, horario, frecuencia)</li>
        </ol>
      </div>
    )}
  </div>
)}
```

**Step 2: Commit**

```bash
git add src/components/ops/rondas/RondasConfiguracionClient.tsx
git commit -m "ux(rondas): add installation summary panel and first-time wizard prompt"
```

---

### Task 9: Show incidents in ops monitor

**Files:**
- Modify: `src/components/ops/rondas/RondasMonitoreoClient.tsx` — add incident badges/panel
- Modify: API if needed to include incident counts

**Step 1: Add incident count to monitor data**

In the monitor API or client-side fetch, include incident count per ejecucion. Add a red badge on ronda cards that have incidents:

```tsx
{row.incidentCount > 0 && (
  <Badge variant="destructive" className="text-[10px]">
    {row.incidentCount} incidente{row.incidentCount > 1 ? "s" : ""}
  </Badge>
)}
```

**Step 2: Add incident detail in ronda panel**

When a ronda is selected in the monitor, show its associated incidents with: tipo, descripcion, timestamp, photo thumbnail (if available).

**Step 3: Commit**

```bash
git add src/components/ops/rondas/
git commit -m "feat(rondas): show guard-reported incidents in ops monitor"
```

---

## Execution Order

Tasks 1-2 are quick bug fixes. Tasks 3-4 are moderate. Tasks 5-8 are UI refactoring. Task 9 is the ops integration.

Recommended: Execute in order (1 → 9). Each task is independently committable.
