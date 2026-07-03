# Fase 6 — Auditoría de notificaciones + Slack personal (DM) + acciones masivas · Checkpoint

Stop file de la fase. Si necesitas detener la implementación, avísalo aquí.

## Invariantes
- Slack personal = DM del bot, **opt-in, default OFF** para todos los tipos.
- Columna Slack interactiva sólo si el usuario tiene `SlackUserLink`; si no, CTA "Vincula tu Slack".
  Si el tenant no tiene workspace ACTIVO, la columna no se muestra.
- El DM personal respeta quiet hours / No molestar EXACTAMENTE como push.
- Reusar `SlackOutbox` (misma confiabilidad + cron) para los DMs; `dmChannelId` cacheado en `SlackUserLink`.
- Migraciones aditivas a mano; tenantId en todo; archivos ≤150; DS v3 mobile-first (375px).

## Bloques
- [ ] BLOQUE 0 — Auditoría integral → `docs/notifications/AUDIT_2026-07.md`
- [ ] BLOQUE 1 — Fixes (badge retry, OpenAI 401, DEP0169 si es propio)
- [ ] BLOQUE 2 — Schema + despacho canal Slack personal
- [ ] BLOQUE 3 — UI columna Slack
- [ ] BLOQUE 4 — Acciones masivas por módulo y canal
- [ ] BLOQUE 5 — QA + docs

## Pendientes operativos para Carlos (reportar en el informe)
- Período contable julio 2026 faltante (`No existe periodo contable para 2026-07`) — 6x en billing/issue.
- Rotar API key de OpenAI (401) en panel de proveedores IA.
- P2002 puntual en checkpoint de rondas — revisar idempotencia.
