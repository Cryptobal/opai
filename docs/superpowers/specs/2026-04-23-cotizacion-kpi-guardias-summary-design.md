# Resumen de guardias en header de cotización

**Fecha:** 2026-04-23
**Componente afectado:** `src/components/cpq/CpqQuoteDetail.tsx` (sticky header con "Total / mes").

> **Nota de implementación:** en el spec inicial se asumió que la barra visible era `QuoteKpiBar`. Al implementar se verificó que ese componente está definido pero no se renderiza en ningún lado; el "Total / mes" visible en la captura es JSX inline en el sticky header de `CpqQuoteDetail.tsx`. El diseño (Opción A aprobada) se aplicó directamente ahí, preservando el comportamiento acordado.

## Problema

En el detalle de una cotización (`/crm/cotizaciones/[id]`), la barra de KPIs muestra colapsada solo precio total / mes + UF + margen %. El usuario quiere ver el número de guardias junto al precio y un resumen minimalista de los roles (cargo + rol/turno) sin saturar la UI. La solución debe ser mobile-first.

## Diseño aprobado (Opción A)

### Colapsado (default mobile, altura sin cambios ~44px)

```
$9.091.554  227.13 UF   · 4 guardias        [34.5%] ⌄
```

- Nuevo chip `· N guardias` insertado entre UF y el spacer flex, ocultable si `totalGuards === 0`.
- Estilo: texto `text-xs text-muted-foreground` precedido por `·` separador; sin fondo (no es un badge).
- En viewports muy estrechos (<360px) el chip se trunca al desaparecer el texto "guardias" a favor del número, o bien se oculta (ver comportamiento responsive abajo).

### Expandido (al tocar la barra)

Debajo del grid existente (Puestos · Guardias · Costo · Margen) se añade una fila nueva con el desglose por rol:

```
┌──────────────────────────────────────────────────────────┐
│ PUESTOS  GUARDIAS  COSTO       MARGEN                    │
│   3         4      $5.9M       $3.1M                     │
├──────────────────────────────────────────────────────────┤
│ 2× Supervisor 4x4 · 1× Guardia 5x2 · 1× Portero 2x5      │
└──────────────────────────────────────────────────────────┘
```

- Fila única con borde-top sutil (`border-t border-emerald-500/15`).
- Cada entrada: `{qty}× {cargoName} {rolName}` separadas por `·`.
- Si `cargoName` y `rolName` ya coinciden (caso edge), se muestra solo uno.
- Si la lista excede el ancho: `overflow-x-auto` con `scrollbar-hide`, sin wrap.
- Altura añadida: ~22-28px.

## Comportamiento responsive

- **Mobile (<640px):**
  - Chip `· N guardias` en colapsado (siempre visible si hay guardias).
  - Si el precio ya ocupa demasiado (truncate se activa), el chip mantiene su `shrink-0` y empuja el margen.
  - Lista de roles con scroll horizontal.
- **Tablet/Desktop (≥640px):** igual, con más espacio disponible — no hay layout alterno.
- **`alwaysExpanded=true` (sidebar desktop):** mostrar directamente el chip + fila de roles, sin toggle.

## Agregación de roles

Helper puro, memoizado en `CpqQuoteDetail.tsx` (o movido a `src/lib/cpq/` si crece):

```ts
type PositionSummaryItem = { qty: number; label: string };

function summarizePositionsByRole(
  positions: CpqPosition[],
  cargos: { id: string; name: string }[],
  roles: { id: string; name: string }[],
): PositionSummaryItem[]
```

- Agrupa por `${cargoId}::${rolId}`.
- `qty` = suma de `numGuards * (numPuestos || 1)`.
- `label` = `${cargoName} ${rolName}`.trim() — si un nombre falta se usa solo el otro; si ambos faltan, `"Sin asignar"`.
- Orden: `qty` desc, luego `label` asc.
- Se pasa como prop `roleSummary: PositionSummaryItem[]` al `QuoteKpiBar`.

## Cambios a `QuoteKpiBar`

Nuevas props opcionales (todas con default para no romper callers):

```ts
interface QuoteKpiBarProps {
  // ...existentes
  roleSummary?: Array<{ qty: number; label: string }>;
  showGuardsChipInCollapsed?: boolean; // default true
}
```

- `roleSummary` se renderiza en la fila nueva del estado expandido.
- `showGuardsChipInCollapsed` permite a callers (ej. sidebar desktop con `alwaysExpanded`) ocultar el chip si fuese redundante.

## Archivos tocados

- `src/components/cpq/CpqQuoteDetail.tsx` — (1) computar `roleSummary` con `useMemo` usando `positions[].cargo?.name` / `positions[].rol?.name` (el API ya los incluye como relaciones embebidas); (2) añadir estado `guardsBreakdownOpen`; (3) en el sticky header, agregar chip tappeable `· N guardias ⌄` y fila de desglose visible al expandir.
- No se necesita `useCpqCatalogs()` porque las posiciones vienen hidratadas con `cargo` y `rol` desde `/api/cpq/quotes/[id]`.

## Fuera de alcance

- Cambiar el `MobileBottomBar` (ya muestra `N guardias`, se mantiene como está).
- Tooltip/popover sobre el chip (Opción B descartada).
- Cambios en `FinancialPanel` / `QuoteBreakdownPanel`.

## Testing manual

1. Cotización con 0 guardias → chip oculto, fila de roles oculta.
2. Cotización con 1 puesto, 1 guardia, 1 rol → `· 1 guardias` (plural se acepta por simplicidad; ver nota) y fila con `1× {Cargo} {Rol}`.
3. Cotización con múltiples cargos/roles mezclados → orden por cantidad desc, scroll horizontal si satura.
4. Mobile viewport 375px: chip visible, precio y margen no se superponen.
5. Sidebar desktop (`alwaysExpanded`): chip + fila visibles sin toggle.

**Nota sobre plural:** por simplicidad y consistencia con el resto del módulo CPQ, se mantiene siempre `guardias` (incluso con 1). Si el usuario pide singularizar, es un ajuste trivial posterior.
