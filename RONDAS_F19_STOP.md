# RONDAS F19 — Rondas visibles: hilo iniciada→terminada, fallas que gritan, digest diario

Este archivo es el kill-switch de la fase: si existe, no re-ejecutar el prompt 19.

## Progreso por bloque

- [x] **B1** — Emisores: catálogo += `ronda_started`; servicio
      `lifecycle-notifications.ts` (started/terminada/no-realizadas, `after()`,
      nunca lanzan) cableado en TODOS los orígenes: portal `iniciar`/`iniciar-libre`,
      `public/iniciar`, inicio implícito (primera marcación), ambos `completar`,
      sync offline y los 3 crons de cierre. Deep link nuevo
      `/ops/rondas/reportes?ejecucionId=` (API + modal auto-abierto). Setting
      `rondas_notif_policy` (`rondaStartedEnabled` default true + digest).
      Decisión: fallas usan `ronda_completed` variante ⚠️ (no `ronda_failed`).
      COMMIT `feat(rondas): eventos de inicio, término y falla emitidos con contexto completo`
      ✅ gate OK

- [x] **B2** — `RondaSlackThread` (migración aditiva 20261010000000). En dispatch:
      `ronda_*` + `data.rondaId` → hilo; SOLO `ronda_started` funda raíz; término
      = reply + `chat.update` de la raíz (`rondas-thread.ts`, usa `data.resumen`);
      hilo manda sobre ruteo; dedupe outbox incluye rondaId. `ronda_alert_admin`
      acepta `ejecucionId` (marcar, alert-engine, pánico x2) → alertas al hilo.
      COMMIT `feat(slack): cada ronda es un hilo con su historia completa`
      ✅ gate OK

- [x] **B3** — Tipo `rondas_daily_digest` + cron horario `/api/cron/rondas-daily-digest`
      (hora por tenant, default 08:00 Chile; dedupe Setting por dayKey + outbox).
      Fórmula: completadas ÷ programadas del día (no ad-hoc, día Chile). Desglose
      por instalación peor→mejor con semáforo 🔴<70 · 🟠 70-90 · ✅>90 (umbrales
      en Setting), top 10 + "…y N más", botón 📊 Ver reportes.
      COMMIT `feat(rondas): digest diario de cumplimiento por instalación`
      ✅ gate OK

- [x] **B4** — `docs/rondas/notificaciones.md` (mapa de eventos, hilo, deep link,
      digest, configuración, matriz QA de 12 casos).
      COMMIT `docs(rondas): fase 19`

**FASE 19 COMPLETA** — 4/4 bloques, gates verdes (`npx tsc --noEmit` 0 errores).
Falta correr la matriz QA en un workspace real (MCP Slack sin autorizar en la
sesión de Claude).

## Hallazgos de auditoría (para no re-auditar)

- 4 caminos de INICIO: portal `iniciar` (pendiente|incompleta→en_curso), portal
  `iniciar-libre` (create en_curso; el resume NO re-emite), `public/ronda/iniciar`
  (RUT+PIN), e inicio IMPLÍCITO en `marcar-checkpoint-service` (toda marca pone
  en_curso; emitir solo si status previo era `pendiente` sin `startedAt`).
- 2 caminos de TÉRMINO (portal/public `completar`, regla `missedPercent>20 →
  incompleta`) + sync offline (`public/ronda/sync` crea ya `completada`).
- Crons: `cerrar-atrasadas` → `no_realizada`; `cerrar-libres`/`cerrar-en-curso`
  → `cerrada_auto`. Todos con listas pre-fetch por tenant (updateMany batch).
- `notify()` NO devuelve el ts de Slack (dispatch corre en `after()`); el ts
  vive en `dispatch.ts` tras `slackPostMessage` — ahí se ancla la raíz (patrón
  TicketSlackThread F7.1/F14).
- Ruteo por `SlackChannelRoute` (KEY > CATEGORY > MODULE > default), NO por
  Setting JSON.
- `ronda_completed` es audiencia `cliente` sin broadcast in-app (fan-out solo
  targeted) → emitirlo sin targetIds = solo Slack, cero ruido. `ronda_started`
  nuevo con defaults apagados (vive en Slack).
- NO existía deep link por ejecución: el detalle es un Dialog client-side en
  `/ops/rondas/reportes` (`RondaAuditMapModal` keyed por row.id) — F19 agrega
  `?ejecucionId=` (API acepta filtro puntual + la página abre el modal).
- El dedupe del outbox era `tenant|key|title|minuto`: títulos genéricos de
  rondas colisionaban entre ejecuciones distintas → se agregó `|r:{rondaId}`.
- `FIELD_KEY_BLACKLIST` (blocks.ts) ahora excluye `^resumen$` (clave interna
  para el chat.update de la raíz; ya va en el body).
