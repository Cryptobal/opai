# Fase 7.1 — Ruteo por categoría · Tarjetas ricas · Mis tickets · Reacciones cruzadas · App Home

Stop file de la fase. Si necesitas detener, avísalo aquí.

## Paso manual previo (Carlos)
Manifest: scopes bot `reactions:read` + `reactions:write`; bot_events `reaction_added`,
`reaction_removed`, `app_home_opened`; `features.app_home.home_tab_enabled: true`. **Re-autorizar.**

## Invariantes / decisiones (no re-debatir)
- `SlackChannelRoute.matchType` sigue siendo String; valor nuevo `CATEGORY` (sin migración).
  Precedencia en `resolveChannel`: **KEY > CATEGORY > MODULE > default**.
- Tarjetas sobrias: `fields` (≤6 pares), no muros de texto; `critical` conserva el 🚨.
- Enrichers: el emisor enriquece `data`; en dispatch sólo tickets carga lo mínimo por `ticketId`.
- Reacciones: asimetría documentada. Hacia Slack salen del BOT (Slack no permite reaccionar por
  terceros). Hacia OPAI llegan con el admin vinculado; no vinculados se omiten en v1.
  Anti-loop: `event.user === botUserId` se ignora.
- App Home reusa `action_id: "opai_action_open"` del hub; refresca tras cada acción.
- ≤150 líneas/archivo, cero deps nuevas, tenantId en todo, un commit por bloque, gate tsc verde.

## Bloques
- [x] B1 — CATEGORY en ruteo (dispatch + API + UI)
- [x] B2 — Renderer genérico de fields
- [x] B3 — Enrichers tickets + postulaciones + leads
- [x] B4 — Tool `get_my_tickets`
- [x] B5 — Hub "Mis tickets" + `/opai ayuda`
- [x] B6 — Reacciones Slack→OPAI
- [x] B7 — Reacciones OPAI→Slack
- [x] B8 — App Home (+ mensaje de bienvenida único vía `SlackUserLink.welcomedAt`, migración aditiva)
- [x] B9 — Botones de gestión + responsable en tarjetas de ticket (Comentar · Estado · Aplazar/Pausar/Silenciar SLA)
- [x] B10 — URLs canónicas por entidad en tools + regla system prompt + tarjetas de entidades en el bot
- [x] B11 — Menciones cruzadas en comentarios de tickets (bidireccional + notificación)
- [ ] B12 — OPAI como agente nativo (agent_view): assistant_thread_started/context_changed, suggested prompts, setStatus/setTitle
- [ ] B13 — QA + docs

## Invariantes añadidos (fase extendida)
- Controles SLA (aplazar/pausar/silenciar) y cambio de estado: REUSAR los servicios reales
  del detalle `/ops/tickets/[id]`; extraer a servicio si viven sólo en el route. Confirmación
  vía `SlackPendingAction` cuando aplique (aplazar pide fecha → modal datepicker).
- Links del bot: SIEMPRE del campo `url` que devuelven las tools; PROHIBIDO adivinar rutas
  (regla dura en el system prompt v2). Toda tool de entidades incluye `url` absoluta.
- Menciones: Slack→OPAI parsea `<@U...>` → `SlackUserLink` → mención real + notify; OPAI→Slack
  convierte `<@adminId>` a `<@U...>` si vinculado, si no nombre plano.
