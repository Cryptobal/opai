# F4 — Flujo de Caja: delta responses — STOP

## Estado

Rama: `feature/cashflow-f4-delta` (sobre F3). Sin merge.

| Bloque | Commit | Estado |
|--------|--------|--------|
| B1 `returnRange` en endpoints | `feat(cashflow-api): returnRange opcional…` | ✅ |
| B2 `replaceWeeks` + `patchMatrix` | `feat(cashflow): replaceWeeks + patchMatrix…` | ✅ |
| B3 client parche / fallback | `feat(cashflow): las mutaciones parchean…` | ✅ |
| B4 stop notes | este archivo | ✅ |

## Qué cambió

1. **Server:** helper `partial-projection.ts` — `returnRange` Zod (yyyy-MM-dd, span ≤ 5 semanas) + `buildPartialProjection` / `withPartialProjection`. Endpoints de mutación (move occ/dte, amount, upsert-and-act, exclude-flow, status) aceptan `returnRange` opcional y adjuntan `data.projection` tras éxito. Fallo del parcial → log `[Finance/Cashflow] partial-projection` y respuesta sin projection (mutación ya aplicada).
2. **Caché:** `replaceWeeks` (incoming gana) + `patchMatrix` en `useWeekCache` / `useGridWindow`.
3. **Client:** helpers pasan `returnRange` y devuelven `projection`. Settle / move: con projection → `patchMatrix` (0 GET); sin ella → `refreshWeeks` (fallback F1). Grupos (sueldos / moveGroup): solo el **último** POST del batch pide `returnRange`. Undo de move/hide también viaja con `returnRange`.

## Retrocompatibilidad

Sin `returnRange` en el body → respuesta idéntica a producción previa (move/amount sin `data`; resto con `data` sin `projection`).

## NO implementado (explícito)

**NO** se implementó caching server de `buildProjection` (`unstable_cache`). Evaluación futura aparte con Carlos — riesgo de datos stale multi-tenant / entre mutaciones.

## Checklist manual

- [ ] Mover una cuota: DevTools muestra **1 solo** request (el POST de move); celda, fila FC y KPIs consistentes con un reload.
- [ ] Editar monto y ocultar: ídem, 1 request cada uno.
- [ ] Crear desde celda vacía: la cuota llega con `id` real en el parche (chip definitivo sin parpadeo).
- [ ] Editar el total de un grupo de sueldos: N POSTs; solo el último trae proyección; subtotal cuadra.
- [ ] Simular fallo del parcial (`projection` undefined): fallback `refreshWeeks` reconcilia.
- [ ] Cliente sin `returnRange` (curl body viejo): respuesta idéntica a producción actual.
- [ ] POST con `returnRange` de 20 semanas → 400 por el guard de span.

## Gate

```
npx prisma generate && npx tsc --noEmit
npx vitest run src/components/finance/cashflow/v2
```
