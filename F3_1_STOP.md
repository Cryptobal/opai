# F3.1 — HOTFIX: semanas del horizonte en skeleton eterno

## Estado

Rama: `hotfix/cashflow-horizon-fetch` (desde `main` @ `d5a23b8`). **Sin merge.**

| Bloque | Commit | Estado |
|--------|--------|--------|
| B1 ventana visible → ensureRange | `fix(cashflow): la ventana visible siempre dispara ensureRange…` | ✅ |
| B2 token de invalidación | `fix(cashflow): fetches paralelos…` | ✅ |
| B3 stop notes | este archivo | ✅ |

## Causa

1. Al montar/cambiar horizonte, `slots` crecía y `pendingKeys` pintaba skeleton, pero **nadie llamaba `ensureRange`** (solo `goTo`).
2. `loadToken` global `++` por cada fetch descartaba respuestas paralelas de rangos distintos (clicks rápidos / step=1).

## Fix

1. **`useGridWindow`:** `useEffect` sobre `slots` garantiza siempre la ventana visible. `goTo` solo mueve el ancla.
2. **`useWeekCache`:** `invalidationToken` solo sube en `invalidate` / `invalidateWeeks`. Fetches paralelos de huecos distintos se mergean. Contador `inflightRef` para `loading`. `staleRef` se consume en el primer merge post-invalidate.
3. **`findMissingGap`** (pura en `week-keys.ts`) + tests.

## Checklist manual

- [ ] Con localStorage en 24s, recargar: las 24 columnas cargan (skeleton breve → datos), sin navegar.
- [ ] Cambiar 8s → 32s en caliente: las columnas nuevas cargan solas.
- [ ] Click rápido 5× en `→`: todas las semanas intermedias terminan con datos.
- [ ] DevTools: 8s → 24s dispara **UN** fetch del hueco contiguo (no 16).
- [ ] Mover una cuota sigue instantáneo (F4 `patchMatrix` intacto).
- [ ] Buscador de folios (`refreshAt`) salta y pinta bien.
- [ ] Móvil 375 px: ventana de 3 semanas intacta.

## Gate

```
npx prisma generate && npx tsc --noEmit
npx vitest run src/components/finance/cashflow/v2
```
