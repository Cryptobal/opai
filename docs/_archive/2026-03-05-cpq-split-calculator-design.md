# CPQ Module - Split Calculator UX Refactoring

## Status: Design Approved

## Summary

Replace the 5-step wizard (Datos > Puestos > Costos > Resumen > Enviar) with a single-page split-view layout ("Split Calculator") where all sections are visible and scrollable on the left, with a sticky financial panel on the right.

## Current Architecture

- `CpqQuoteDetail.tsx` (~2000 lines) - main component with `activeStep` state (0-4)
- Already has 2-column layout (`lg:grid lg:grid-cols-[1fr_340px]`) but sidebar only has `QuoteKpiBar`
- `CreatePositionModal.tsx` / `EditPositionModal.tsx` - CPQ-specific, call API directly
- `PuestoFormModal.tsx` (shared) - used only by `CrmInstallationDetailClient`
- `CpqQuoteCosts.tsx` - costs management (large component)
- `CpqPricingCalc.tsx` - margin slider + pricing breakdown
- `SendCpqQuoteModal.tsx` - send flow
- `QuoteKpiBar.tsx` - KPI bar with mobile/desktop modes
- `CpqPositionCard.tsx` - position cards with edit/clone/delete

## Key Decisions

1. **No wizard elimination** - Remove `QuoteStepIndicator` and `activeStep` gating. Show all sections simultaneously.
2. **Position modals stay separate** - CPQ modals (Create/Edit) and shared `PuestoFormModal` have different APIs. Unification is out of scope for now.
3. **Sidebar enhancement** - Expand existing sidebar from just KPI bar to full financial panel with waterfall breakdown, value-per-hour, and document preview tab.
4. **Mobile bottom bar** - Replace wizard navigation bar with summary bar + bottom sheet for financial details.
5. **Presentation-only changes** - No API, data layer, or calculation logic changes.

## Target Layout

```
Header (sticky): Back + Code + Badge + Save + Send
+-------------------------------------------+------------------+
| Editor (scrollable)                        | Financial Panel  |
|  - Datos (clickable grid)                  | (sticky sidebar) |
|  - Puestos (expandable cards)              |  - Sale hero     |
|  - Costos (expandable table)               |  - Waterfall     |
|  - Margin (presets + slider)               |  - Value/hour    |
|  - Financials (financial/policy)           |  - Desglose tab  |
|  - AI + Preview (doc preview)              |  - Preview tab   |
+-------------------------------------------+------------------+
Mobile: bottom bar with total + margin + "Ver detalle"
```

## Files to Modify

- `src/components/cpq/CpqQuoteDetail.tsx` - Major refactor (remove wizard, flatten sections)
- `src/components/cpq/CpqPositionCard.tsx` - Enhanced card with expand/collapse
- `src/components/cpq/QuoteKpiBar.tsx` - Evolve into FinancialPanel
- `src/components/cpq/CpqPricingCalc.tsx` - Margin section with presets
- `src/components/cpq/QuoteStepIndicator.tsx` - Remove or deprecate

## Files to Create

- `src/components/cpq/FinancialPanel.tsx` - New sidebar component
- `src/components/cpq/MobileBottomBar.tsx` - New mobile summary bar
- `src/components/cpq/DatosSection.tsx` - Clickable grid for CRM context
- `src/components/cpq/MarginSection.tsx` - Presets + slider + input

## Constraints

- No changes to: DB schemas, APIs, calculation logic, types/interfaces
- No changes to: send flow, PDF generation, AI description, permissions
- Must work on mobile (375px+) and desktop (1024px+)
