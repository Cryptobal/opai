# F1_STOP — Flujo de Caja: motor sin latencia

Estado: **COMPLETO**. Rama `feature/cashflow-f1-engine` (no mergeada a main).
Gate por commit: `npx prisma generate && npx tsc --noEmit`. Suite v2: 32/32 verde.

## Objetivo

Latencia percibida ~0 ms en move / editar monto / ocultar: optimista permanente,
reconciliación de red acotada a 1–2 semanas, cero `router.refresh()` en el ciclo
de mutación. Sin cambio visual, sin migraciones, sin tocar `projection.service.ts`
ni endpoints.

## Commits

| Bloque | Hash | Mensaje |
|--------|------|---------|
| B1 | `7d3184b1b` | feat(cashflow): invalidación selectiva de semanas en el caché de la grilla (dropWeeks + refreshWeeks) |
| B2 | `b6c730780` | feat(cashflow): saldo acumulado FC derivado client-side desde displayRows (reacciona al optimista) |
| B3 | `cb1cab5c3` | perf(cashflow): elimina el doble buildProjection por mutación — HealthHeader consume el caché client |
| B4 | `77b63c6f1` | feat(cashflow): cola de mutaciones optimistas con reconciliación por semana (useCashflowMutations) |
| B5 | (este) | docs(cashflow): F1 stop notes + checklist de verificación |

## Archivos tocados / nuevos

**Nuevos**
- `grid/derive-balance.ts` — `deriveCumulative` (≤120 líneas)
- `grid/useCashflowMutations.ts` — cola pending por id (≤150 líneas)
- `grid/__tests__/drop-weeks.test.ts`
- `grid/__tests__/derive-balance.test.ts`
- `grid/__tests__/mutations-queue.test.ts`

**Modificados**
- `grid/week-cache-merge.ts` — `dropWeeks`
- `grid/week-keys.ts` — `parseWeekKey`
- `grid/useWeekCache.ts` — `invalidateWeeks`
- `grid/useGridWindow.ts` — `refreshWeeks`
- `grid/optimistic-move.ts` — `PendingEntry`, `applyAllPending`, `removePendingById`
- `grid/useGridMove.ts` — `refreshWeeks` + clear por id (sin clear global)
- `CashflowGrid.tsx` — cableado; HealthHeader desde `active` + `derivedCumulative`
- `HealthHeader.tsx` — prop `derivedPoints` para cierre/quiebre
- `GridCell` / `GridSection` / `GridRow` — `amount?` opcional en patch (grupo/revert)

## Decisiones

1. **`refreshWeeks(keys)`** (no `refreshRange`): el caller ya tiene `bucketKey`s;
   `parseWeekKey` reconstruye fechas. Si una key no parsea → fallback a `refresh()` full.
2. **Ancla client** (Bloque 0.10 / B2): condición EXACTA del server
   `b.end.getTime() <= weekEndDate`. Pre-ancla acumula desde `openingBalanceClp`
   (sin snapshots banco); post-ancla parte de `anchor.bankBalanceClp + net`.
   Sin ancla: `opening + Σnet`. Drift sigue en `cumulativePoints` del server.
3. **`router.refresh()`** solo en `refreshAfterClose` (cierre/reapertura de semana).
   `invalidate()` full solo en `refresh()` y `refreshAt` (buscador de folios).
4. **Cola por id**: nunca `setPendingAmounts([])` / clear global. Amount/hide:
   API ya corre en el cell; el hook solo push → `refreshWeeks` → remove id.
5. **Create / folio**: aún usan refresh de ventana (`refresh` / `refreshAt`); F2
   puede selectivizar create.

## Checklist manual (Carlos)

- [ ] Mover una cuota: la celda cambia al instante, sin parpadeo; red solo pide
      1–2 semanas (DevTools: `projection?from=` cubre ~2 semanas, no 8).
- [ ] Editar dos montos seguidos rápido: ambos quedan; ninguno se revierte solo.
- [ ] Ocultar una fila extra: desaparece al instante; Deshacer la restaura.
- [ ] La fila FC · saldo acumulado se actualiza junto con el optimista (sin esperar red).
- [ ] KPIs de arriba (cierre de semana / quiebre) se mueven tras mover una cuota
      grande, sin recarga de página.
- [ ] Cerrar y reabrir una semana sigue refrescando candados y KPIs (ahí sí hay
      refresh completo + `router.refresh`).

## Fuera de alcance (siguientes fases)

- Endpoints / `buildProjection` / schema
- Create optimista selectivo (ManualEntryQuickAdd)
- Visual / DS migration del módulo Finanzas
