# Auditoría de batería — OPAI (iPad / iPhone PWA)

Documento de hallazgos y correcciones derivadas de una auditoría técnica del
cliente. Fuente de verdad: el repositorio.

## Causas estructurales (impacto en iPad/iPhone)

1. **Sentry Session Replay** grababa el DOM de forma continua (`replaysOnErrorSampleRate: 1.0` + `replayIntegration()`), manteniendo rrweb en buffer en todas las pantallas.
2. **Sin política de suspensión en background**: los pollers del shell ERP seguían emitiendo HTTP con la app oculta (~9 req/min en reposo, cadencias no alineadas).
3. **`backdrop-filter` agresivo** en chrome persistente (`blur(32px) saturate(200%)`) — coste de composición × píxeles físicos (Fase B).
4. **`PlatformAwareBottomNav`** escuchaba `visualViewport.scroll` y forzaba layout + escritura de custom property en cada frame.

## Fase A (implementada — mergeable)

| Bloque | Cambio |
|---|---|
| 1 | Desactivar Session Replay en `instrumentation-client.ts` |
| 2 | Hook `useVisibilityAwareInterval` + migración de 5 pollers globales; silencio de sonido en catch-up de notificaciones |
| 3 | Eliminar `<BadgeClear />` duplicado en layouts de portal (queda solo en root) |
| 4 | Tope real de 36 intentos × 10 s en polling de Knowledge |
| 5 | `useDebouncedValue` en buscador `InSiteList` |
| 6 | Eliminar `use-best-position.ts` (sin llamadores; fuga GPS latente) |
| 7 | Coalescer medición del bottom nav con rAF; quitar `visualViewport.scroll` |
| 8 | Herramientas en `scripts/battery-audit/` |

## Fase B (requiere aprobación humana)

| Bloque | Cambio |
|---|---|
| 9 | Reducir radios de blur del glass + válvula `html[data-perf="low"]` |
| 10 | Corregir cadencia de tracking GPS en `RondaActiva` (~60 POST/min → ~2) |

## Herramientas

Ver `scripts/battery-audit/README.md`.

```bash
node scripts/battery-audit/scan-timers.mjs
```

## Criterios de aceptación (Fase A) — verificación en iPad

- Reposo 5 min en `/hub`: `requests.perMinute` ≈ 2 (baseline ~9).
- App oculta 2 min: `requests.whileHidden === 0`.
- `/api/badge/count` ≈ 1/min (sin duplicar en portales).
- Sin ingest de Sentry Replay en reposo.
- Buscador InSite: una petición por término (debounce 300 ms).
- Bottom nav no tapado por teclado iOS; sin layout storm en scroll inercial.
