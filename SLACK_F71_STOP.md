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
- [ ] B2 — Renderer genérico de fields
- [ ] B3 — Enrichers tickets + postulaciones + leads
- [ ] B4 — Tool `get_my_tickets`
- [ ] B5 — Hub "Mis tickets" + `/opai ayuda`
- [ ] B6 — Reacciones Slack→OPAI
- [ ] B7 — Reacciones OPAI→Slack
- [ ] B8 — App Home (+ mensaje de bienvenida único vía `SlackUserLink.welcomedAt`, migración aditiva)
- [ ] B9 — QA + docs
