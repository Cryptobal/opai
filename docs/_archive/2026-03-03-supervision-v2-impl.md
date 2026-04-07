# Supervision v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance supervision module with grilla sorting/counts, wizard observation fields, auto-finding creation for missing documents, hallazgo entry in evidence step, and client survey persistence in CRM.

**Architecture:** Incremental modifications to existing wizard steps, grilla component, and CRM detail pages. New Prisma model for client surveys. All changes are additive or minor modifications — no structural rewrites.

**Tech Stack:** Next.js 15 App Router, Prisma, shadcn/ui, Tailwind CSS, Zod validation

---

## Task 1: Grilla — add "Vis." column + sorting

**Files:**
- Modify: `src/app/api/ops/supervision/grilla/route.ts:112-126` (add totalVisits)
- Modify: `src/components/supervision/SupervisionGrilla.tsx` (add column + sort UI)

**Step 1: API — add `totalVisits` per installation**

In `src/app/api/ops/supervision/grilla/route.ts`, after building `visitsByInstallationDay` (line 126), compute totalVisits and include in response:

```typescript
// After line 126, add:
const totalVisitsMap: Record<string, number> = {};
for (const [instId, days] of Object.entries(visitMap)) {
  totalVisitsMap[instId] = Object.values(days).reduce((sum, sups) => sum + sups.length, 0);
}
```

In the response (line 134), add `totalVisits`:
```typescript
installations: installations.map((i) => ({
  id: i.id,
  name: i.name,
  openFindings: findingsMap.get(i.id) ?? 0,
  totalVisits: totalVisitsMap[i.id] ?? 0,
})),
```

**Step 2: Component — add "Vis." column + sort dropdown**

In `src/components/supervision/SupervisionGrilla.tsx`:

- Update `Installation` type to include `totalVisits: number`
- Add state: `const [sortMode, setSortMode] = useState<"az" | "most" | "least">("az");`
- Add `useMemo` to sort installations:
```typescript
const sortedInstallations = useMemo(() => {
  if (!data) return [];
  const list = [...data.installations];
  switch (sortMode) {
    case "most": return list.sort((a, b) => b.totalVisits - a.totalVisits);
    case "least": return list.sort((a, b) => a.totalVisits - b.totalVisits);
    default: return list; // already A-Z from API
  }
}, [data, sortMode]);
```
- Add sort buttons next to month selector (3 small buttons: A-Z, ↑, ↓)
- Add `<th>` for "Vis." after "Hall." column header
- Add `<td>` showing `inst.totalVisits` in each row
- Use `sortedInstallations` instead of `data.installations` in tbody map
- Add "Vis." to legend

**Step 3: Verify and commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "(SupervisionGrilla|grilla/route)"` — expect no errors.

---

## Task 2: Dashboard — remove "Últimas visitas"

**Files:**
- Modify: `src/components/supervision/SupervisionDashboardEnhanced.tsx:362-415`
- Modify: `src/app/(app)/ops/supervision/dashboard/page.tsx` (remove visitas prop/query if no longer needed)

**Step 1: Remove the "Últimas visitas" Card block**

In `SupervisionDashboardEnhanced.tsx`, delete lines 362-415 (the entire `{/* Row 4: Recent visits */}` Card).

**Step 2: Clean up unused props if possible**

Check if `visitas` prop is still used elsewhere in the component. If not used after removing the card, remove from Props type and from the dashboard page that passes it. Also remove the unused `canEdit`/`canDelete` props from the destructuring (line 112) and Props type.

**Step 3: Verify and commit**

---

## Task 3: Historial — fix sugerencias de ruta

**Files:**
- Modify: `src/app/(app)/ops/supervision/historial/page.tsx:162-220`

**Step 1: Deduplicate assignments**

After fetching assignments (around line 100), deduplicate:
```typescript
const uniqueAssignments = Array.from(
  new Map(assignments.map((a) => [a.installationId, a])).values()
);
```
Use `uniqueAssignments` instead of `assignments` for the rest of the suggestions logic.

**Step 2: Change "Nunca visitada" to "Sin visita este mes"**

Change the `lastVisits` groupBy query (line 162-171) to filter by current month:
```typescript
const monthStart = new Date();
monthStart.setDate(1);
monthStart.setHours(0, 0, 0, 0);

const groupResult = await prisma.opsVisitaSupervision.groupBy({
  by: ["installationId"],
  where: {
    tenantId,
    supervisorId: session.user.id,
    installationId: { in: installationIds },
    checkInAt: { gte: monthStart }, // Only this month
  },
  _max: { checkInAt: true },
});
```

Update the badge label (around line 306-308):
```tsx
{s.daysSinceLastVisit === null
  ? "Sin visita este mes"
  : `${s.daysSinceLastVisit}d sin visita`}
```

**Step 3: Verify and commit**

---

## Task 4: Quick-create — add "Nueva Visita"

**Files:**
- Modify: `src/components/opai/TopbarActions.tsx:41-52`
- Modify: `src/components/opai/AppShell.tsx` (mobile menu)

**Step 1: Add item to desktop QUICK_CREATE_ITEMS**

In `TopbarActions.tsx`, add to the `QUICK_CREATE_ITEMS` array (after "Nuevo Documento"):
```typescript
{ label: "Nueva Visita", icon: Activity, navigateHref: "/ops/supervision/nueva-visita" },
```
Import `Activity` from `lucide-react`.

**Step 2: Add item to mobile AppShell**

In `AppShell.tsx`, find the mobile quick-create items array and add the same entry.

**Step 3: Verify and commit**

---

## Task 5: Wizard Step 1 — remove guard counter

**Files:**
- Modify: `src/components/supervision/wizard/Step1CheckIn.tsx:153-159, ~458-465`
- Modify: `src/components/supervision/wizard/SupervisionVisitWizard.tsx:463-464`
- Modify: `src/components/supervision/wizard/Step5Closure.tsx:589-602`

**Step 1: Remove counter UI from Step 1**

In `Step1CheckIn.tsx`:
- Remove the "Guardias presentes encontrados" section (around lines 458-465) — the input for `guardsPresent` and the expected count display
- Remove the `guardsPresent`/`setGuardsPresent` state and the `guardsExpected` references that feed the counter
- Keep the dotación list (guard names, puestos, shifts) intact

**Step 2: Remove from checkout payload**

In `SupervisionVisitWizard.tsx` lines 463-464, remove:
```typescript
guardsExpected: visit.guardsExpected,
guardsFound: guardsPresent,
```

**Step 3: Remove from Step 5 summary**

In `Step5Closure.tsx`, remove the "Guardias" row (lines 589-602) from the summary grid.

**Step 4: Verify and commit**

---

## Task 6: Wizard Step 2 — installation state observations textarea

**Files:**
- Modify: `src/components/supervision/wizard/Step2Evaluation.tsx:189-204`
- Modify: `src/components/supervision/wizard/SupervisionVisitWizard.tsx` (new state + pass prop)
- Modify: `src/components/supervision/wizard/Step5Closure.tsx` (show in summary)
- Modify: `src/app/api/ops/supervision/[id]/checkout/route.ts:13-30` (accept new field)
- Modify: `src/components/supervision/wizard/types.ts:80-98` (add to VisitData)

**Step 1: Add `installationStateNotes` to types**

In `types.ts`, add to `VisitData`:
```typescript
installationStateNotes: string | null;
```

**Step 2: Add state + prop in wizard orchestrator**

In `SupervisionVisitWizard.tsx`:
- Add state: `const [installationStateNotes, setInstallationStateNotes] = useState("");`
- Pass to Step2: `installationStateNotes={installationStateNotes} onInstallationStateNotesChange={setInstallationStateNotes}`
- Include in checkout body: `installationStateNotes`
- Include in PATCH calls where `installationState` is saved

**Step 3: Add textarea in Step 2**

In `Step2Evaluation.tsx`, after the `<Select>` for installation state (line ~204), add:
```tsx
{(installationState === "incidencia" || installationState === "critico") && (
  <div className="mt-3">
    <label className="text-sm font-medium text-muted-foreground">
      Observaciones de la instalación
    </label>
    <Textarea
      value={installationStateNotes}
      onChange={(e) => onInstallationStateNotesChange(e.target.value)}
      placeholder="Describe las observaciones encontradas..."
      className="mt-1"
      rows={3}
    />
  </div>
)}
```

**Step 4: Show in Step 5 summary**

In `Step5Closure.tsx`, after the installation state display, add:
```tsx
{visit.installationStateNotes && (
  <div className="col-span-2">
    <p className="text-xs text-muted-foreground">Observaciones</p>
    <p className="text-sm">{visit.installationStateNotes}</p>
  </div>
)}
```

**Step 5: Accept in checkout API**

In `checkout/route.ts`, add to `checkoutSchema`:
```typescript
installationStateNotes: z.string().max(2000).optional().nullable(),
```
Add to `fullData`:
```typescript
...(body.installationStateNotes !== undefined ? { installationStateNotes: body.installationStateNotes } : {}),
```

**Step 6: Prisma schema — add column**

Add to `OpsVisitaSupervision` model:
```prisma
installationStateNotes String? @db.Text
```
Create migration.

**Step 7: Verify and commit**

---

## Task 7: Wizard Step 3 — unified document flow (Contrato, OS10, Libro)

**Files:**
- Modify: `src/components/supervision/wizard/Step3Checklist.tsx`
- Modify: `src/components/supervision/wizard/types.ts` (expand DocumentCheckResult)

**Step 1: Expand DocumentCheckResult type**

In `types.ts`, update:
```typescript
export type DocumentCheckResult = {
  code: string;
  isChecked: boolean;
  lastEntryDate: string | null;    // NEW
  photoFile: File | null;
  photoPreview: string | null;
  autoFindingId: string | null;    // NEW — tracks auto-created finding
  autoTicketCode: string | null;   // NEW — tracks auto-created ticket
};
```

**Step 2: Modify document rendering in Step 3**

For each document type (Contrato, OS10, Libro Novedades), render:
```tsx
{/* Document check */}
<div className="space-y-2 rounded-md border p-3">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium">{doc.label}</span>
    <div className="flex gap-2">
      <Button size="sm" variant={result.isChecked === true ? "default" : "outline"} onClick={() => handleDocCheck(doc.code, true)}>Sí</Button>
      <Button size="sm" variant={result.isChecked === false ? "destructive" : "outline"} onClick={() => handleDocCheck(doc.code, false)}>No</Button>
    </div>
  </div>

  {/* If present → date + photo */}
  {result.isChecked === true && (
    <div className="space-y-2 pl-2 border-l-2 border-emerald-500/30">
      <div>
        <label className="text-xs text-muted-foreground">Fecha última entrada</label>
        <input type="date" value={result.lastEntryDate ?? ""} onChange={...} className="..." />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Foto última página (obligatoria)</label>
        <input type="file" accept="image/*" capture="environment" onChange={...} />
        {result.photoPreview && <img src={result.photoPreview} className="h-20 rounded" />}
      </div>
    </div>
  )}

  {/* If not present → auto-finding confirmation */}
  {result.isChecked === false && (
    <div className="rounded bg-red-500/10 p-2 text-xs">
      {result.autoFindingId ? (
        <p className="text-emerald-400">Hallazgo creado — Ticket #{result.autoTicketCode}</p>
      ) : (
        <p className="text-red-400">Se creará hallazgo crítico: "{doc.label} no presente"</p>
      )}
    </div>
  )}
</div>
```

**Step 3: Auto-create finding on "No"**

When user clicks "No" for a document:
```typescript
async function handleDocCheck(code: string, present: boolean) {
  updateDocResult(code, { isChecked: present });

  if (!present && visitId) {
    // Auto-create finding
    const res = await fetch(`/api/ops/supervision/${visitId}/findings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "documentation",
        severity: "critical",
        description: `${docLabel} no presente`,
      }),
    });
    const json = await res.json();
    if (json.success) {
      updateDocResult(code, {
        autoFindingId: json.data.id,
        autoTicketCode: json.data.ticket?.code ?? null,
      });
      toast.success(`Hallazgo creado${json.data.ticket ? ` — Ticket #${json.data.ticket.code}` : ""}`);
    }
  }
}
```

**Step 4: Unify Libro Novedades with the same flow**

The existing Libro Novedades section has its own Sí/No + photo + notes. Replace it with the same unified document component. The existing `bookUpToDate`, `bookLastEntryDate`, `bookNotes`, `bookPhotoFile` state can map to the unified `DocumentCheckResult` for the "libro_novedades" code.

**Step 5: Verify and commit**

---

## Task 8: Wizard Step 4 — add hallazgo entry

**Files:**
- Modify: `src/components/supervision/wizard/Step4Evidence.tsx`
- Reuse: `src/components/supervision/wizard/FindingModal.tsx` (already exists)

**Step 1: Add hallazgo section after photo categories**

In `Step4Evidence.tsx`, after the photo categories section, add:
```tsx
{/* Hallazgo entry */}
<Card>
  <CardHeader>
    <CardTitle className="text-base">Hallazgos</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* List of created findings */}
    {findings.filter(f => f.category !== "documentation").map((f) => (
      <div key={f.id} className="flex items-center justify-between rounded border p-2 text-sm">
        <div>
          <p className="font-medium">{f.description}</p>
          <p className="text-xs text-muted-foreground">{f.category} · {f.severity}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {f.ticketCode ? `Ticket #${f.ticketCode}` : f.severity}
        </Badge>
      </div>
    ))}

    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={() => setShowFindingModal(true)}
    >
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      Agregar hallazgo
    </Button>
  </CardContent>
</Card>
```

**Step 2: Wire up FindingModal**

- Add state: `const [showFindingModal, setShowFindingModal] = useState(false);`
- Render `<FindingModal>` with `visitId`, `onCreated` callback that appends to findings list
- Pass `findings` and `setFindings` from parent wizard

**Step 3: Add ticketCode to Finding type**

In `types.ts`, add to `Finding`:
```typescript
ticketCode: string | null;
```

Update `FindingModal` to return `ticket.code` from the API response.

**Step 4: Verify and commit**

---

## Task 9: Wizard Step 5 — summary improvements

**Files:**
- Modify: `src/components/supervision/wizard/Step5Closure.tsx`

**Step 1: Ensure generalComments appears in summary**

Check that `generalComments` is shown in the summary section. If not, add it after installationState display:
```tsx
{generalComments && (
  <div className="col-span-2">
    <p className="text-xs text-muted-foreground">Comentarios generales</p>
    <p className="text-sm whitespace-pre-wrap">{generalComments}</p>
  </div>
)}
```

**Step 2: Remove express guard reference**

In the express visit warning, remove any mention of guards count.

**Step 3: Verify and commit**

---

## Task 10: Prisma — new OpsEncuestaCliente model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration file

**Step 1: Add model to schema**

```prisma
model OpsEncuestaCliente {
  id                     String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId               String
  visitId                String    @unique @db.Uuid
  installationId         String    @db.Uuid
  accountId              String?   @db.Uuid
  contactName            String
  contactRole            String?
  serviceQuality         Int?
  scheduleCompliance     Int?
  personalPresentation   Int?
  professionalism        Int?
  supervisionPresence    Int?
  incidentResponse       Int?
  hasUrgentRisk          Boolean?
  urgentRiskDetail       String?   @db.Text
  npsScore               Int?
  additionalComments     String?   @db.Text
  signatureUrl           String?
  clientPhotoUrl         String?
  averageScore           Float?
  createdAt              DateTime  @default(now())

  visit        OpsVisitaSupervision @relation(fields: [visitId], references: [id])
  installation CrmInstallation      @relation(fields: [installationId], references: [id])
  account      CrmAccount?          @relation(fields: [accountId], references: [id])

  @@index([tenantId])
  @@index([installationId])
  @@index([accountId])
  @@schema("ops")
}
```

Add relation fields to existing models:
- `OpsVisitaSupervision`: `encuestaCliente OpsEncuestaCliente?`
- `CrmInstallation`: `encuestasCliente OpsEncuestaCliente[]`
- `CrmAccount`: `encuestasCliente OpsEncuestaCliente[]`

Also add `installationStateNotes` column to `OpsVisitaSupervision`:
```prisma
installationStateNotes String? @db.Text
```

**Step 2: Generate and apply migration**

```bash
npx prisma migrate dev --name supervision_v2_encuesta_cliente
```

**Step 3: Verify and commit**

---

## Task 11: Checkout API — save encuesta + installationStateNotes

**Files:**
- Modify: `src/app/api/ops/supervision/[id]/checkout/route.ts`

**Step 1: Add survey fields to checkout schema**

Add to `checkoutSchema`:
```typescript
installationStateNotes: z.string().max(2000).optional().nullable(),
// Survey fields for encuesta creation
surveyData: z.object({
  serviceQuality: z.number().int().min(1).max(5).nullable(),
  scheduleCompliance: z.number().int().min(1).max(5).nullable(),
  personalPresentation: z.number().int().min(1).max(5).nullable(),
  professionalism: z.number().int().min(1).max(5).nullable(),
  supervisionPresence: z.number().int().min(1).max(5).nullable(),
  incidentResponse: z.number().int().min(1).max(5).nullable(),
  hasUrgentRisk: z.boolean().nullable(),
  urgentRiskDetail: z.string().max(2000).optional().nullable(),
  npsScore: z.number().int().min(0).max(10).nullable(),
  additionalComments: z.string().max(2000).optional().nullable(),
}).optional().nullable(),
```

**Step 2: Create OpsEncuestaCliente after visit update**

After the visit update (line ~156), if `clientContacted` and `surveyData`:
```typescript
if (body.clientContacted && body.surveyData) {
  const installation = await prisma.crmInstallation.findUnique({
    where: { id: visit.installationId },
    select: { accountId: true },
  });

  const scores = [
    body.surveyData.serviceQuality,
    body.surveyData.scheduleCompliance,
    body.surveyData.personalPresentation,
    body.surveyData.professionalism,
    body.surveyData.supervisionPresence,
    body.surveyData.incidentResponse,
  ].filter((s): s is number => s !== null);

  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;

  try {
    await prisma.opsEncuestaCliente.create({
      data: {
        tenantId: ctx.tenantId,
        visitId: id,
        installationId: visit.installationId,
        accountId: installation?.accountId ?? null,
        contactName: body.clientContactName ?? "",
        contactRole: null,
        ...body.surveyData,
        signatureUrl: body.clientValidationUrl,
        averageScore,
      },
    });
  } catch (e) {
    console.warn("[SUPERVISION] Failed to create encuesta:", e);
  }
}
```

**Step 3: Update wizard to send surveyData in checkout**

In `SupervisionVisitWizard.tsx`, add `surveyData` to checkout body:
```typescript
surveyData: clientContacted ? surveyData : null,
```

**Step 4: Verify and commit**

---

## Task 12: CRM — show encuestas in Account + Installation detail

**Files:**
- Modify: `src/components/crm/CrmAccountDetailClient.tsx` (associated sections)
- Modify: `src/components/crm/CrmInstallationDetailClient.tsx:2053-2129` (associated sections)
- Modify: Server pages that fetch data for these components (add encuestas to include)

**Step 1: Add encuestas to data fetching**

In the server page that loads account detail, add to the Prisma include:
```typescript
encuestasCliente: {
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    contactName: true,
    averageScore: true,
    npsScore: true,
    createdAt: true,
    visitId: true,
  },
},
```

Same for installation detail.

**Step 2: Add "Encuestas Cliente" section to Account detail**

In `CrmAccountDetailClient.tsx`, add to `associatedSections`:
```typescript
{
  id: "encuestas",
  label: "Encuestas Cliente",
  icon: ClipboardList,
  count: account.encuestasCliente?.length ?? 0,
  content: (
    <div className="space-y-2">
      {account.encuestasCliente?.map((enc) => (
        <CrmRelatedRecordCard
          key={enc.id}
          title={enc.contactName}
          subtitle={new Intl.DateTimeFormat("es-CL", { dateStyle: "short" }).format(new Date(enc.createdAt))}
          badge={enc.averageScore ? `${enc.averageScore.toFixed(1)}/5` : undefined}
          href={`/ops/supervision/${enc.visitId}`}
        />
      ))}
    </div>
  ),
},
```

**Step 3: Same for Installation detail**

Add identical section to `CrmInstallationDetailClient.tsx` associated sections.

**Step 4: Verify and commit**

---

## Execution Order

1. **Task 10** first (Prisma migration — needed by Tasks 6, 7, 11)
2. **Tasks 1-4** can run in parallel (independent UI changes)
3. **Tasks 5-9** sequential (wizard changes, each builds on previous)
4. **Task 11** after Task 10 (checkout API changes)
5. **Task 12** after Task 10+11 (CRM display)

## Recommended Batch Order:
1. Task 10 (migration)
2. Tasks 1, 2, 3, 4 (parallel — grilla, dashboard, historial, quick-create)
3. Tasks 5, 6, 7 (wizard steps 1-3)
4. Tasks 8, 9 (wizard steps 4-5)
5. Task 11 (checkout API)
6. Task 12 (CRM integration)
