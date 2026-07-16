# F3 — Flujo de Caja: horizonte + nav 1s + gráfico + Agregar — STOP

## Estado

Rama: `feature/cashflow-f3-horizon` (sobre F2). Sin merge.

| Bloque | Commit | Estado |
|--------|--------|--------|
| B1 horizonte 8/16/24/32 | `feat(cashflow): horizonte configurable…` | ✅ |
| B2 nav 1 semana + skeleton | `feat(cashflow): navegación de a 1 semana…` | ✅ |
| B3 prefetch idle | `perf(cashflow): prefetch en idle…` | ✅ |
| B4 mini-gráfico SVG | `feat(cashflow): mini-gráfico SVG…` | ✅ |
| B5 + Agregar + totales banda | `feat(cashflow): fila + Agregar…` | ✅ |
| B6 historial best-effort | `feat(cashflow): historial best-effort…` | ✅ |
| B7 stop notes | este archivo | ✅ |

## Decisiones / notas

- **Ancla primero, fetch después:** `goTo` hace `setAnchorDate` inmediato + `void ensureRange`. Seguro porque el ancla es fecha estable y `resolve` rellena con `emptyBucket`; `pendingKeys` pinta skeleton.
- **Horizonte:** `localStorage` key `opai.cashflow.horizon`. Móvil sigue en 3 semanas (intocado). Desktop: segmented 8/16/24/32; en &lt;sm cae a `<select>` nativo.
- **Prefetch:** solo desktop (`usePrefetchWindow`). Móvil no prefetch (ahorro de datos).
- **Gráfico:** SVG propio, key `opai.cashflow.chart` (`open|closed`). Default open desktop / closed móvil.
- **Historial:** best-effort con `source`, `hasAmountOverride`, y comparación `scheduledDate` vs semana de columna. **No hay `createdAt` de occurrence en el payload.**
- **Housekeeping:** se extrajo `GridToolbar.tsx`. `CashflowGrid` sigue ~670 líneas (diálogos cierre/reapertura + DnD). `useClosedWeeks` no se extrajo (presupuesto).

## TODO explícito

```
// TODO(audit-trail): historial completo (quién/cuándo por movimiento)
// requiere modelo de auditoría de occurrences — no se crea en F3.
```

## Checklist manual

- [ ] Selector 16s: la grilla crece desde el ancla; recargar la página conserva 16.
- [ ] Flecha → avanza exactamente 1 semana; clic rápido 5 veces no bloquea; columnas nuevas muestran skeleton y luego datos.
- [ ] Con 16s prefetcheado, avanzar 1 a 1 no dispara red (DevTools).
- [ ] Gráfico: barras y línea coinciden con la fila FC; click en una barra navega; colapsarlo persiste.
- [ ] "+ Agregar ingreso…": type-ahead → monto → Enter crea; la cuota aparece al instante y es movible.
- [ ] Totales de sección en la banda, alineados con las columnas; ya no hay fila de subtotal.
- [ ] Panel: historial muestra creada/ajustada sin inventar movimientos.
- [ ] Móvil 375 px: selector usable, gráfico colapsado por defecto, ventana sigue en 3 semanas.

## Gate

```
npx prisma generate && npx tsc --noEmit
npx vitest run src/components/finance/cashflow/v2
```
