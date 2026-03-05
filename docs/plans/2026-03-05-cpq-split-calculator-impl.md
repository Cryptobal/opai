# CPQ Split Calculator — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the CPQ 5-step wizard with a single-page split-view layout where all sections scroll together on the left, with a sticky financial panel on the right.

**Architecture:** Refactor `CpqQuoteDetail.tsx` to remove the `activeStep` gating that shows/hides sections. Instead, render all sections simultaneously in a scrollable left column. Move pricing breakdown and document preview into a new `FinancialPanel` sidebar component. Add a mobile bottom bar for small screens.

**Tech Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui, dark theme

**Design spec:** `docs/plans/2026-03-05-cpq-split-calculator-design.md`

---

## Key Files Reference

| File | Role |
|------|------|
| `src/components/cpq/CpqQuoteDetail.tsx` | Main 2000-line component with wizard logic |
| `src/components/cpq/QuoteStepIndicator.tsx` | Step pills (to be removed) |
| `src/components/cpq/QuoteKpiBar.tsx` | KPI bar (mobile collapsable / desktop expanded) |
| `src/components/cpq/CpqPositionCard.tsx` | Position card with edit/clone/delete |
| `src/components/cpq/CpqQuoteCosts.tsx` | Costs panel (uniforms, exams, meals, vehicles, etc.) |
| `src/components/cpq/CpqPricingCalc.tsx` | Margin slider + cost breakdown |
| `src/components/cpq/CreatePositionModal.tsx` | CPQ position creation modal |
| `src/components/cpq/EditPositionModal.tsx` | CPQ position edit modal |
| `src/components/cpq/SendCpqQuoteModal.tsx` | Send quote modal |
| `src/components/cpq/utils.ts` | Formatting helpers |
| `src/types/cpq.ts` | TypeScript types (DO NOT MODIFY) |

---

## Task 1: Extract DatosSection component

**Files:**
- Create: `src/components/cpq/DatosSection.tsx`
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

**Step 1: Create DatosSection.tsx**

Extract the `activeStep === 0` block (lines ~1083-1361 of CpqQuoteDetail) into a standalone component. This section contains:
- CRM context grid (Cuenta, Instalacion, Contacto, Negocio) with SearchableSelect + inline create modals
- Quote name input
- Date + Currency row + Save button
- Installation address preview

Props interface:
```tsx
interface DatosSectionProps {
  quote: CpqQuote;
  quoteForm: { name: string; clientName: string; validUntil: string; notes: string; status: CpqQuote["status"] };
  setQuoteForm: React.Dispatch<React.SetStateAction<typeof quoteForm>>;
  quoteDirty: boolean;
  setQuoteDirty: (dirty: boolean) => void;
  savingQuote: boolean;
  quoteError: string | null;
  crmContext: { accountId: string; installationId: string; contactId: string; dealId: string; currency: string };
  crmAccounts: { id: string; name: string }[];
  crmInstallations: CrmInstallationOption[];
  crmContacts: { id: string; firstName: string; lastName: string; email?: string | null }[];
  crmDeals: { id: string; title: string }[];
  saveCrmContext: (patch: Partial<CrmContext>) => Promise<void>;
  saveQuoteBasics: () => Promise<void>;
  isLocked: boolean;
}
```

Move all the inline create modal state and logic into this component (inlineCreateType, inlineForm, inlineCreating, createInline handler). Keep the CRM data loading effects in the parent since other sections also need crmContext.

**Step 2: Replace in CpqQuoteDetail**

Replace the `{activeStep === 0 && (...)}` block with:
```tsx
<DatosSection
  quote={quote}
  quoteForm={quoteForm}
  setQuoteForm={setQuoteForm}
  // ... pass all needed props
/>
```

Remove the `{activeStep === 0 && ...}` guard — always render.

**Step 3: Verify**

Run `npx next build` or dev server. Ensure the datos section renders and CRM selects work.

**Step 4: Commit**

```
feat(cpq): extract DatosSection component from wizard step 0
```

---

## Task 2: Extract MarginSection component

**Files:**
- Create: `src/components/cpq/MarginSection.tsx`
- Modify: `src/components/cpq/CpqPricingCalc.tsx` (reference only, keep existing)

**Step 1: Create MarginSection.tsx**

New component with margin presets + slider + input. This replaces the margin input that's currently inside `CpqPricingCalc`.

```tsx
interface MarginSectionProps {
  marginPct: number;
  onMarginChange: (margin: number) => void;
  marginAmount: number; // Calculated margin in CLP
  isLocked?: boolean;
}
```

UI:
- Preset buttons: `[8%] [10%] [13%] [15%] [18%] [20%]` — click sets margin immediately
- Range slider input (0-30%, step 0.5) with green accent
- Numeric input editable on the right
- Color coding: >=15% green, >=10% amber, <10% red
- Below: "= $765.577 margen" text

The margin change calls `onMarginChange` which triggers the existing `PUT /api/cpq/quotes/:id/margin` + refresh flow already in CpqQuoteDetail.

**Step 2: Verify**

Dev server — margin presets work, slider works, input works. Changing margin updates the KPI bar values.

**Step 3: Commit**

```
feat(cpq): add MarginSection with presets, slider, and input
```

---

## Task 3: Create FinancialPanel sidebar component

**Files:**
- Create: `src/components/cpq/FinancialPanel.tsx`
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

**Step 1: Create FinancialPanel.tsx**

This is the new sticky sidebar that replaces the simple QuoteKpiBar in the desktop aside. It has two tabs: "Desglose" and "Preview".

```tsx
interface FinancialPanelProps {
  // Summary data
  positionsCount: number;
  totalGuards: number;
  marginPct: number;
  salePriceMonthly: number;
  additionalLinesTotal: number;
  ufValue: number | null;
  // Cost breakdown
  costSummary: CpqQuoteCostSummary | null;
  costCategoryBreakdown: { equipment: number; transport: number; vehicle: number; infra: number; system: number };
  financialAmount: number;
  policyAmount: number;
  marginAmount: number;
  costsBase: number;
  // Hourly rates
  positions: CpqPosition[];
  positionHourlyRates: Map<string, number>;
  // Preview tab
  quote: CpqQuote;
  crmContext: CrmContext;
  crmContacts: Contact[];
  crmInstallations: CrmInstallationOption[];
  crmDeals: Deal[];
  currency: string;
  // AI generation
  onGenerateAiDescription: () => void;
  generatingAi: boolean;
  aiCustomInstruction: string;
  setAiCustomInstruction: (v: string) => void;
  onGenerateServiceDetail: () => void;
  generatingServiceDetail: boolean;
  serviceDetailInstruction: string;
  setServiceDetailInstruction: (v: string) => void;
  // Send
  quoteId: string;
  sendingPortal: boolean;
  onSendPortal: () => void;
  isLocked: boolean;
}
```

**Tab "Desglose"** layout:
1. **Sale hero block** — large green-gradient box with total CLP + UF equivalent + "P:X G:X M:X%"
2. **Waterfall bars** — for each cost category, show: label + percentage + amount + proportional bar
   - Mano de obra (summary.monthlyPositions)
   - Directos (uniforms + exams + meals + holidays + equipment)
   - Indirectos (transport + vehicles + infra + systems)
   - Financiero (financialAmount)
   - Poliza (policyAmount)
3. **Totals** — "Total costos" line + "Margen (X%)" line
4. **Value per hour** — collapsible section with per-position hourly rates

**Tab "Preview"** layout:
- Move the document preview currently in `activeStep === 4` left column into this tab
- Move the AI description/service detail generation UI into this tab
- Keep `SendCpqQuoteModal` and "Enviar por Portal" button at the bottom

**Step 2: Wire into CpqQuoteDetail**

Replace the desktop `<aside>` content (currently just QuoteKpiBar) with the FinancialPanel.

**Step 3: Verify**

Both tabs work, data updates in real-time when costs/margin change.

**Step 4: Commit**

```
feat(cpq): add FinancialPanel sidebar with desglose and preview tabs
```

---

## Task 4: Create MobileBottomBar component

**Files:**
- Create: `src/components/cpq/MobileBottomBar.tsx`
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

**Step 1: Create MobileBottomBar.tsx**

Replaces the wizard navigation bar (Anterior/Siguiente) for mobile.

```tsx
interface MobileBottomBarProps {
  salePriceMonthly: number;
  additionalLinesTotal: number;
  marginPct: number;
  ufValue: number | null;
  // Financial panel content for bottom sheet
  financialPanelContent: React.ReactNode;
  // Send action
  sendButton: React.ReactNode;
}
```

Layout:
- Fixed bottom, backdrop-blur, z-40
- Left: sale price (font-bold) + UF equivalent + margin badge
- Right: "Ver detalle" button (opens Sheet bottom sheet) + Send button
- The Sheet contains the financial panel desglose content

Use shadcn `Sheet` component with `side="bottom"`.

**Step 2: Wire into CpqQuoteDetail**

Replace the current fixed bottom bar (lines ~1915-1949) with:
- `<MobileBottomBar>` visible on `lg:hidden`
- Remove the Anterior/Siguiente navigation entirely

**Step 3: Verify**

Resize browser to mobile width. Bottom bar shows sale price + margin. "Ver detalle" opens sheet with breakdown.

**Step 4: Commit**

```
feat(cpq): add MobileBottomBar with bottom sheet for financial details
```

---

## Task 5: Remove wizard — render all sections simultaneously

**Files:**
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

This is the main refactoring task. It transforms the wizard into a single-page scroll.

**Step 1: Remove wizard gating**

In CpqQuoteDetail.tsx:

1. Remove `QuoteStepIndicator` import and usage (line 1064)
2. Remove `activeStep` state and `goToStep` function
3. Remove `steps`, `stepIcons`, `isLastStep`, `nextLabel`, `nextDisabled` variables
4. Remove the `useEffect` that triggers refresh on `activeStep >= 3` — instead, always keep data fresh (or refresh on mount only)
5. Remove the `useEffect` that auto-calculates salePriceBase on `activeStep === 3`

Replace the conditional rendering:
```tsx
// BEFORE:
{activeStep === 0 && (...)}
{activeStep === 1 && (...)}
{activeStep === 2 && (...)}
{activeStep === 3 && (...)}
{activeStep === 4 && (...)}

// AFTER:
<DatosSection ... />
<div className="border-t border-border/10 mt-7 pt-5">
  {/* Puestos section */}
</div>
<div className="border-t border-border/10 mt-7 pt-5">
  <CpqQuoteCosts ... />
</div>
<div className="border-t border-border/10 mt-7 pt-5">
  <MarginSection ... />
</div>
<div className="border-t border-border/10 mt-7 pt-5">
  {/* Financials card (financial/policy) */}
</div>
```

**Step 2: Update layout structure**

```tsx
return (
  <div className="pb-20 lg:pb-4">
    {/* Sticky header */}
    <div className="sticky top-[53px] z-30 bg-background/95 backdrop-blur border-b border-border/40 -mx-4 px-4 py-2 mb-4">
      {/* header content: back + code + badge + save + send */}
    </div>

    {/* Split view */}
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-0">
      {/* Editor: scrollable left column */}
      <div className="space-y-0 min-w-0 lg:pr-6">
        <DatosSection ... />
        {/* Puestos */}
        {/* Costos */}
        <MarginSection ... />
        {/* Financials card */}
      </div>

      {/* Sidebar: sticky right column (desktop only) */}
      <aside className="hidden lg:flex flex-col sticky top-[105px] h-[calc(100vh-105px)] border-l border-border/40 overflow-y-auto">
        <FinancialPanel ... />
      </aside>
    </div>

    {/* Mobile bottom bar */}
    <MobileBottomBar className="lg:hidden" ... />
  </div>
);
```

**Step 3: Ensure auto-calc of salePriceBase**

Move the auto-calculation of `salePriceBase` from the `activeStep === 3` effect to run whenever `costSummary` or `marginPct` changes:

```tsx
useEffect(() => {
  if (!costSummary || !costParams) return;
  const base = Number(costParams.salePriceBase ?? 0);
  if (base > 0) return;
  // ... same calculation
  if (rounded > 0) updateParams({ salePriceBase: rounded });
}, [costSummary, costParams, marginPct]);
```

**Step 4: Remove old bottom bar**

Delete the fixed bottom navigation bar (lines ~1915-1949 with Anterior/Siguiente).

**Step 5: Verify**

- All sections visible on single page
- Scroll works smoothly
- Sidebar sticky on desktop
- Mobile bottom bar visible on small screens
- All CRUD operations still work (create/edit/delete positions, save costs, change margin)

**Step 6: Commit**

```
feat(cpq): remove wizard, render all sections in single-page split view
```

---

## Task 6: Enhance header with sticky layout

**Files:**
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

**Step 1: Redesign header**

Current header (lines ~999-1062) has: back button, code, name, badge, status toggle, PDF, overflow menu.

Redesign to match spec:
```tsx
<div className="sticky top-[53px] z-30 bg-background/95 backdrop-blur-xl border-b border-border/40 -mx-4 px-4 py-2.5">
  <div className="flex items-center gap-3">
    <Link href="/crm/cotizaciones">
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </Link>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold tracking-tight truncate">{quote.code}</h1>
        {quote.name && <span className="text-sm text-foreground/70 truncate">— {quote.name}</span>}
        <Badge variant="outline" className="text-[10px] h-5 shrink-0 capitalize">{quote.status}</Badge>
      </div>
      <span className="text-[11px] text-muted-foreground truncate block">
        {quote.clientName || "Sin cliente"}
        {/* contact name if available */}
      </span>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={saveQuoteBasics} disabled={!quoteDirty || savingQuote}>
        {savingQuote ? "..." : quoteDirty ? "Guardar" : "Guardado"}
      </Button>
      <SendCpqQuoteModal ... />
      {/* overflow menu */}
    </div>
  </div>
</div>
```

Key changes:
- `text-base font-bold tracking-tight` for code (was `text-sm`)
- Subtitle with account -> contact
- Save and Send buttons prominently in header
- PDF download moves to overflow menu

**Step 2: Verify**

Header stays sticky on scroll. Buttons work correctly.

**Step 3: Commit**

```
feat(cpq): enhance sticky header with save/send buttons
```

---

## Task 7: Enhance CpqPositionCard with expand/collapse

**Files:**
- Modify: `src/components/cpq/CpqPositionCard.tsx`

**Step 1: Add expand/collapse behavior**

Currently the card has 2 rows: title+badges and costs. Add a collapsed/expanded toggle:

**Collapsed (default):**
- Left: guard count badge (large, circular) + title (Cargo - Puesto) + cost total aligned right
- Below title: shift tag (Nocturno/Diurno with color), weekdays, hours, rotation badge
- Click anywhere on card body toggles expand

**Expanded:**
- Everything from collapsed
- Separator line
- Stats grid: Puestos | Guardias/puesto | Rotacion | Costo Cia | Liquido | Sueldo base
- Action buttons: Editar | Duplicar | Recalcular | Eliminar

Replace the current layout:

```tsx
const [expanded, setExpanded] = useState(false);

return (
  <Card className="overflow-hidden border border-muted/40">
    {/* Collapsed content — always visible */}
    <div
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Guard count badge */}
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
        <span className="text-sm font-bold">{position.numGuards * (position.numPuestos || 1)}</span>
      </div>

      {/* Title + tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <Badge ... shiftType tag />
          <Badge ... weekdays />
          <Badge ... hours />
          <Badge ... rotation />
        </div>
      </div>

      {/* Total cost */}
      <div className="text-right shrink-0">
        <span className="text-sm font-bold tabular-nums">{formatCurrency(Number(position.monthlyPositionCost))}</span>
        <span className="text-[10px] text-muted-foreground block">/mes</span>
      </div>
    </div>

    {/* Expanded content */}
    {expanded && (
      <div className="border-t border-border/40 px-3 py-2.5 bg-muted/5">
        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
          <div><span className="text-muted-foreground">Puestos:</span> {position.numPuestos || 1}</div>
          <div><span className="text-muted-foreground">Guard/puesto:</span> {position.numGuards}</div>
          <div><span className="text-muted-foreground">Rotación:</span> {position.numGuards}x{position.numPuestos || 1}</div>
          <div><span className="text-muted-foreground">Costo Cía:</span> <span className="font-mono">{formatCurrency(Number(position.employerCost))}</span></div>
          <div><span className="text-muted-foreground">Líquido:</span> <span className="font-mono">{formatCurrency(Number(position.netSalary || 0))}</span></div>
          <div><span className="text-muted-foreground">Base:</span> <span className="font-mono">{formatCurrency(Number(position.baseSalary))}</span></div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 pt-1 border-t border-border/30">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setOpenEdit(true); }}>
              <Pencil className="h-3 w-3" /> Editar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleClone(); }}>
              <Copy className="h-3 w-3" /> Duplicar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(); }}>
              <Trash2 className="h-3 w-3" /> Eliminar
            </Button>
          </div>
        )}
      </div>
    )}

    {/* Modals */}
    <EditPositionModal ... />
    <CostBreakdownModal ... />
  </Card>
);
```

**Step 2: Verify**

Cards collapse/expand. Edit/Clone/Delete still work. Click on action buttons doesn't toggle expand.

**Step 3: Commit**

```
feat(cpq): enhance position cards with expand/collapse layout
```

---

## Task 8: Add Puestos section footer with total

**Files:**
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

**Step 1: Add total footer**

After the position cards list, add a dashed-border footer:

```tsx
{positions.length > 0 && (
  <div className="flex justify-between items-center px-3 py-2 border border-dashed border-border/60 rounded-lg mt-2">
    <span className="text-xs font-semibold text-muted-foreground">Total mano de obra</span>
    <span className="text-sm font-bold tabular-nums">
      {formatCurrency(positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0))}
    </span>
  </div>
)}
```

**Step 2: Commit**

```
feat(cpq): add total mano de obra footer to puestos section
```

---

## Task 9: Move financials card inline (from step 3)

**Files:**
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`

**Step 1: Move the financials card**

The "Gastos financieros" Card (lines ~1447-1610 in current code, financial + poliza toggles) currently only shows on `activeStep === 3`. Move it to always render, below the MarginSection.

Remove the `{activeStep === 3 && ...}` guard around the financials Card. Place it as its own section after MarginSection.

**Step 2: Verify**

Financial/policy toggles and inputs work. Save button persists data.

**Step 3: Commit**

```
feat(cpq): show financials section inline instead of wizard step
```

---

## Task 10: Cleanup — remove QuoteStepIndicator and dead code

**Files:**
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`
- Maybe delete: `src/components/cpq/QuoteStepIndicator.tsx` (check if used elsewhere first)

**Step 1: Remove unused imports and state**

In CpqQuoteDetail:
- Remove `QuoteStepIndicator` import
- Remove `activeStep`, `setActiveStep` state
- Remove `steps`, `stepIcons` constants
- Remove `goToStep` function
- Remove `isLastStep`, `nextLabel`, `nextDisabled` variables
- Remove any `activeStep`-dependent useEffect hooks (already handled in Task 5)

**Step 2: Check if QuoteStepIndicator is used elsewhere**

```bash
grep -r "QuoteStepIndicator" --include="*.tsx" --include="*.ts" -l
```

If only used in CpqQuoteDetail, delete the file. If used elsewhere, leave it.

**Step 3: Verify**

`npx next build` — no errors, no unused imports.

**Step 4: Commit**

```
refactor(cpq): remove wizard step indicator and dead navigation code
```

---

## Task 11: Responsive polish and QA

**Files:**
- Modify: `src/components/cpq/CpqQuoteDetail.tsx`
- Modify: `src/components/cpq/FinancialPanel.tsx`
- Modify: `src/components/cpq/MobileBottomBar.tsx`

**Step 1: Test desktop layout (1024px+)**

- Sidebar sticky and scrollable independently
- All sections visible and reachable by scroll
- Financial panel updates in real-time
- Send button accessible in sidebar footer

**Step 2: Test mobile layout (375px - 1023px)**

- Sidebar hidden
- Bottom bar visible with sale price + margin
- "Ver detalle" opens bottom sheet
- All sections stack vertically
- Inputs and selects usable on touch
- No horizontal overflow

**Step 3: Test all CRUD operations**

- [ ] Create position (CreatePositionModal)
- [ ] Edit position (EditPositionModal)
- [ ] Clone position
- [ ] Delete position
- [ ] Expand/collapse cost items
- [ ] Override cost item prices
- [ ] Change margin (presets, slider, input)
- [ ] Toggle financial on/off
- [ ] Toggle policy on/off
- [ ] Save financials
- [ ] Generate AI description
- [ ] Generate AI service detail
- [ ] Send via presentation (SendCpqQuoteModal)
- [ ] Send via portal
- [ ] Download PDF
- [ ] Clone quote
- [ ] Delete quote
- [ ] Change status (draft/sent)
- [ ] Navigate to account/contact/installation/deal

**Step 4: Fix any issues found**

**Step 5: Commit**

```
fix(cpq): responsive polish and QA fixes for split calculator layout
```

---

## Execution Order Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Extract DatosSection | Medium — extract + props |
| 2 | Create MarginSection | Small — new component |
| 3 | Create FinancialPanel | Large — new sidebar with tabs |
| 4 | Create MobileBottomBar | Small — fixed bar + Sheet |
| 5 | Remove wizard, render all sections | Large — main refactor |
| 6 | Enhance sticky header | Small — CSS + layout |
| 7 | Enhance position cards | Medium — new expand/collapse |
| 8 | Puestos total footer | Tiny — one block |
| 9 | Move financials inline | Small — remove guard |
| 10 | Cleanup dead code | Small — deletions |
| 11 | Responsive QA | Medium — testing + fixes |

**Recommended execution:** Tasks 1-4 can be parallelized (independent new components). Tasks 5-6 are the main refactor. Tasks 7-9 are enhancements. Task 10-11 are cleanup/QA.

---

## What NOT to touch (golden rule)

- No API routes or server actions
- No DB schemas or types
- No calculation logic (mano de obra, costos, financiero, poliza, margen formulas)
- No send/PDF/AI generation flows (just move them, don't change behavior)
- No shared PuestoFormModal (different module, different API)
- No other CRM modules (leads, instalaciones)
