# Deal Pipeline Stepper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deal stage dropdown with a visual chevron pipeline stepper, add "Activa" badge to active quotation, and cancel follow-ups when entering Negociacion stage.

**Architecture:** New `DealPipelineStepper` component rendered via a new `pipelineBar` slot in `EntityDetailLayout`. The stepper shows open stages as connected chevron segments, with Ganado/Perdido as separate pill buttons. Stage change logic reused from existing `updateStage` function. Backend gains one extra condition for follow-up cancellation.

**Tech Stack:** React, Tailwind CSS, existing `ConfirmDialog` component, Prisma

---

### Task 1: Add `pipelineBar` slot to EntityDetailLayout

**Files:**
- Modify: `src/components/crm/EntityDetailLayout.tsx`

**Step 1: Add the prop and render slot**

In `EntityDetailLayoutProps` interface (line ~34), add:

```typescript
/** Optional pipeline bar rendered between header and tabs */
pipelineBar?: ReactNode;
```

In the component destructuring (line ~99), add `pipelineBar`.

In the JSX, right before the `<ChipTabs>` (line ~271), add:

```tsx
{/* Pipeline bar */}
{pipelineBar}
```

**Step 2: Verify build**

Run: `npx next build --no-lint 2>&1 | head -30`
Expected: No errors related to EntityDetailLayout

**Step 3: Commit**

```bash
git add src/components/crm/EntityDetailLayout.tsx
git commit -m "feat(crm): add pipelineBar slot to EntityDetailLayout"
```

---

### Task 2: Create DealPipelineStepper component

**Files:**
- Modify: `src/components/crm/CrmDealDetailClient.tsx` (add component at top of file, inside same file)

**Step 1: Add the stepper component**

Add this component definition inside `CrmDealDetailClient.tsx` before the main `CrmDealDetailClient` function (around line 97, after the type definitions):

```tsx
function DealPipelineStepper({
  stages,
  currentStageId,
  dealStatus,
  onStageClick,
  onWonClick,
  onLostClick,
  disabled,
}: {
  stages: PipelineStageOption[];
  currentStageId: string | undefined;
  dealStatus: string | undefined;
  onStageClick: (stageId: string) => void;
  onWonClick: () => void;
  onLostClick: () => void;
  disabled?: boolean;
}) {
  const openStages = stages.filter((s) => !s.isClosedWon && !s.isClosedLost);
  const wonStage = stages.find((s) => s.isClosedWon);
  const lostStage = stages.find((s) => s.isClosedLost);
  const currentIdx = openStages.findIndex((s) => s.id === currentStageId);
  const isWon = dealStatus === "won";
  const isLost = dealStatus === "lost";
  const isClosed = isWon || isLost;

  return (
    <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-thin">
      {/* Open stages as chevron steps */}
      <div className="flex items-stretch min-w-0">
        {openStages.map((stage, idx) => {
          const isCurrent = !isClosed && stage.id === currentStageId;
          const isPast = !isClosed && currentIdx >= 0 && idx < currentIdx;
          const isFuture = !isClosed && currentIdx >= 0 && idx > currentIdx;
          const isFirst = idx === 0;
          const isLast = idx === openStages.length - 1;
          const stageColor = stage.color || "#94a3b8";

          return (
            <button
              key={stage.id}
              type="button"
              disabled={disabled || isClosed}
              onClick={() => onStageClick(stage.id)}
              className={cn(
                "relative flex items-center justify-center px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-all min-w-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isFirst && "rounded-l-md",
                isLast && "rounded-r-md",
                !isFirst && "ml-[2px]",
                isClosed && "opacity-50 cursor-not-allowed",
                !isClosed && !isCurrent && "cursor-pointer hover:brightness-110",
                isCurrent && "text-white shadow-sm",
                isPast && "text-white/80",
                isFuture && "bg-muted text-muted-foreground",
              )}
              style={
                isCurrent
                  ? { backgroundColor: stageColor }
                  : isPast
                    ? { backgroundColor: `${stageColor}60` }
                    : undefined
              }
              title={stage.name}
            >
              {isPast && <Check className="h-3 w-3 mr-1 shrink-0" />}
              <span className="truncate max-w-[120px]">{stage.name}</span>
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-border shrink-0" />

      {/* Ganado button */}
      {wonStage && (
        <button
          type="button"
          disabled={disabled}
          onClick={onWonClick}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isWon
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
              : "border border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/10"
          )}
        >
          <Check className="h-3 w-3" />
          Ganado
        </button>
      )}

      {/* Perdido button */}
      {lostStage && (
        <button
          type="button"
          disabled={disabled}
          onClick={onLostClick}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isLost
              ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm"
              : "border border-border text-muted-foreground hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10"
          )}
        >
          <XCircle className="h-3 w-3" />
          Perdido
        </button>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx next build --no-lint 2>&1 | head -30`
Expected: No errors (component is defined but not yet used)

**Step 3: Commit**

```bash
git add src/components/crm/CrmDealDetailClient.tsx
git commit -m "feat(crm): add DealPipelineStepper component"
```

---

### Task 3: Wire stepper into deal page, remove old Select

**Files:**
- Modify: `src/components/crm/CrmDealDetailClient.tsx`

**Step 1: Add Ganado confirmation modal state**

Near the other state declarations (around line 211), add:

```tsx
const [wonConfirmOpen, setWonConfirmOpen] = useState(false);
const [pendingWonStageId, setPendingWonStageId] = useState<string | null>(null);
```

**Step 2: Add handler functions**

After the existing `updateStage` function (around line 633), add:

```tsx
const handleWonClick = () => {
  const wonStage = pipelineStages.find((s) => s.isClosedWon);
  if (!wonStage) return;
  setPendingWonStageId(wonStage.id);
  setWonConfirmOpen(true);
};

const confirmWon = async () => {
  if (!pendingWonStageId) return;
  setWonConfirmOpen(false);
  await updateStage(pendingWonStageId);
  setPendingWonStageId(null);
};

const handleLostClick = () => {
  const lostStage = pipelineStages.find((s) => s.isClosedLost);
  if (lostStage) updateStage(lostStage.id);
};
```

**Step 3: Pass pipelineBar to EntityDetailLayout**

In the `<EntityDetailLayout>` JSX (around line 1244), add the `pipelineBar` prop:

```tsx
pipelineBar={
  <DealPipelineStepper
    stages={pipelineStages}
    currentStageId={currentStage?.id}
    dealStatus={deal.status}
    onStageClick={updateStage}
    onWonClick={handleWonClick}
    onLostClick={handleLostClick}
    disabled={changingStage}
  />
}
```

**Step 4: Remove the old Select for "Etapa"**

In the `DetailFieldGrid` (around lines 748-772), replace the "Etapa" `<DetailField>` that contains the `<Select>` with a simpler read-only display:

```tsx
<DetailField
  label="Etapa"
  value={
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-2 w-2 rounded-full"
        style={{ backgroundColor: currentStageColor }}
      />
      <span className="text-sm">{currentStage?.name || "Sin etapa"}</span>
      {changingStage && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  }
/>
```

**Step 5: Add the ConfirmDialog for Ganado**

Right before the closing `</>` of the component's return (around line 1290), add:

```tsx
<ConfirmDialog
  open={wonConfirmOpen}
  onOpenChange={setWonConfirmOpen}
  title="Marcar como ganado"
  description="Al marcar este negocio como ganado se cancelaran los seguimientos pendientes y se generara una notificacion de contrato. Esta seguro?"
  confirmLabel="Confirmar"
  cancelLabel="Cancelar"
  onConfirm={confirmWon}
  variant="default"
  loading={changingStage}
  loadingLabel="Procesando..."
/>
```

**Step 6: Verify build**

Run: `npx next build --no-lint 2>&1 | head -30`
Expected: No errors

**Step 7: Commit**

```bash
git add src/components/crm/CrmDealDetailClient.tsx
git commit -m "feat(crm): wire pipeline stepper, add Ganado confirmation modal"
```

---

### Task 4: Add "Activa" badge to active quotation in associated records

**Files:**
- Modify: `src/components/crm/CrmDealDetailClient.tsx`

**Step 1: Update the cotizaciones section in associatedSections**

In the cotizaciones mapping (around line 1196-1216), modify the `CrmRelatedRecordCard` to include an extra badge when it's the active quotation.

Find this line (around 1213):
```tsx
badge={{ label: statusLabel, variant: statusVariant as any }}
```

Replace with:
```tsx
badge={
  info?.id === activeQuotationId
    ? { label: `${statusLabel} | Activa`, variant: "success" as any }
    : { label: statusLabel, variant: statusVariant as any }
}
```

**Step 2: Verify build**

Run: `npx next build --no-lint 2>&1 | head -30`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/crm/CrmDealDetailClient.tsx
git commit -m "feat(crm): show Activa badge on active quotation in associated records"
```

---

### Task 5: Cancel follow-ups when entering Negociacion stage

**Files:**
- Modify: `src/app/api/crm/deals/[id]/stage/route.ts`

**Step 1: Extend the cancellation condition**

Find the block (around lines 112-120):
```typescript
// Si se mueve a etapa de cierre (ganado/perdido), cancelar follow-ups pendientes
if (nextStatus === "won" || nextStatus === "lost") {
```

Replace with:
```typescript
// Si se mueve a etapa de cierre (ganado/perdido) o Negociacion, cancelar follow-ups pendientes
const shouldCancelFollowUps = nextStatus === "won" || nextStatus === "lost" || stage.name === "Negociación";
if (shouldCancelFollowUps) {
```

Update the reason message (line ~116):
```typescript
await cancelPendingFollowUps(
  deal.id,
  nextStatus === "won"
    ? "Deal ganado"
    : nextStatus === "lost"
      ? "Deal perdido"
      : `Etapa cambiada a ${stage.name}`
);
```

**Step 2: Verify build**

Run: `npx next build --no-lint 2>&1 | head -30`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/crm/deals/[id]/stage/route.ts
git commit -m "feat(crm): cancel follow-ups when deal enters Negociacion stage"
```

---

### Task 6: Manual testing & final commit

**Step 1: Start dev server and test**

Run: `npm run dev`

Test in browser:
1. Open a deal detail page
2. Verify pipeline stepper renders between header and tabs
3. Click different stages - verify optimistic update works
4. Click "Ganado" - verify confirmation modal appears
5. Confirm - verify stage changes and seguimientos cancel
6. Check cotizaciones in right panel - verify "Activa" badge shows on the correct one
7. Test responsive: resize browser, verify horizontal scroll on stepper

**Step 2: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "feat(crm): polish pipeline stepper and active quotation badge"
```
