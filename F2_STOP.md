# F2_STOP — Flujo de Caja: la celda es el formulario

Estado: **COMPLETO**. Rama `feature/cashflow-f2-cell` (sobre F1; no mergeada).
Gate por commit: `npx prisma generate && npx tsc --noEmit`. Suite v2: 38/38 verde.

## Objetivo

Toda la operatoria diaria vive **en la celda**: click derecho / long-press → menú
contextual; click en vacía → editor inline (Enter crea, Tab salta); doble click
edita manuales/borradores; chips minimalistas; botón "Manual" retirado.

## Commits

| Bloque | Mensaje |
|--------|---------|
| B1 | `feat(ui): componente context-menu (Radix) siguiendo la convención de dropdown-menu` (`@radix-ui/react-context-menu@^2.3.3`, long-press touch) |
| B2 | `feat(cashflow): editor inline en celda — crear con Enter/Tab en vacías y editar manuales y borradores` |
| B3 | `feat(cashflow): menú contextual de celda — agregar, editar, mover, duplicar, ocultar según estado` |
| B4 | `style(cashflow): chips de cuota minimalistas — borde de estado, mono tabular, micro-feedback` |
| B5 | `refactor(cashflow): retira ManualEntryQuickAdd y AmountCellEditor — flujo absorbido por la celda` |
| B6 | `docs(cashflow): F2 stop notes + checklist` |

## Archivos clave

**Nuevos:** `ui/context-menu.tsx`, `InlineCellEditor.tsx`, `inline-cell-save.ts`,
`CellContextMenu.tsx`, `concept-options.ts`, `can-edit-value.test.ts`

**Eliminados:** `ManualEntryQuickAdd.tsx`, `AmountCellEditor.tsx`

**Semántica create (B0.3):**
- Item real (UUID) → `upsert-and-act` `action:"amount"` (materializa + monto)
- Sintético / sin item → `action:"create"` + `source:"MANUAL"` vía `createManualEntryViaApi`
- Otras actions: `move`, `amount`, `cancel`

## Decisiones

1. `canEditValue`: INCOME editable solo si `MANUAL` o `DRAFT`; facturada fija.
2. Type-ahead "Agregar otro concepto…" → TODO F3 (`AddConceptRow` + `buildConceptOptions`).
3. DnD sensors: delay 180 ms intacto; ContextMenuTrigger con `asChild` + `contents`.
4. Ocultar desde menú: una sola vía API (`hideFromFlowViaApi`) + undo del hook F1.
5. `⇧+drag` duplicar: no implementado (Duplicar del menú cubre el caso).

## Checklist manual (Carlos)

- [ ] Click derecho sobre chip programado: menú completo; "Mover a semana" lista
      solo semanas abiertas; mover funciona con undo.
- [ ] Click derecho sobre pagada: solo Ver factura/detalle + explicación.
- [ ] Click derecho en semana cerrada: bloqueado con hint.
- [ ] Click en celda vacía de una fila de cliente: input inline; Enter crea; Tab
      salta a la semana siguiente; la cuota nueva es movible y ocultable.
- [ ] Doble click en un ingreso MANUAL: edita; en uno facturado: no (sheet explica).
- [ ] Long-press en móvil (375 px) abre el menú; targets ≥44 px; el drag sigue.
- [ ] El botón "Manual" ya no existe (`rg ManualEntryQuickAdd` → solo comentario).

## Fuera de alcance (F3+)

- Type-ahead / `AddConceptRow`
- Endpoint / schema nuevos
- Visual full DS migration Finanzas
