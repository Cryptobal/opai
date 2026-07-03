# Fase 7 — Hub de Acciones Rápidas + Suite de Tickets en Slack · Checkpoint

Stop file de la fase. Si necesitas detener, avísalo aquí.

## Invariantes / decisiones (no re-debatir)
- **Eliminar tickets desde Slack: EXCLUIDO.** Irreversible = solo OPAI web. Desde Slack: Cancelar
  (terminal reversible-auditable, con ConfirmDialog vía `SlackPendingAction`) y Cerrar.
- Toda mutación desde Slack: `recordTicketEvent` (actor real, `source:"slack"`) + `logAudit`.
- Tenant SOLO por `team_id`; identidad SOLO por vínculo (`resolveLinkedAdmin`).
- Registro declarativo `actions/registry.ts`: `{ id, nombre, grupo, capability, buildModal, schema, execute }`.
  Hub, `/opai <accion>` y shortcuts consumen el MISMO registro. Migrar `rendicion`/`ticket` de F5.
- Bandeja: filtros + 10/página; overflow por fila → `views.push`; aprobaciones con Aprobar/Rechazar inline.
- Hilo por ticket: tabla aditiva `TicketSlackThread` (`tenantId`, `ticketId` unique, `slackChannelId`,
  `slackTs`). `dispatch.ts`: si `params.data.ticketId` y hay map → reply al hilo; si es creación → guardar raíz.
- ≤150 líneas/archivo; migraciones aditivas a mano; un commit por bloque.

## Estado: COMPLETA ✅ (bloques 1-10 en `main`)

Hub + registro declarativo; suite de tickets (bandeja, acciones por fila,
aprobaciones, hilo por ticket, comentar desde el hilo); acciones operativas
(turno extra, vacaciones=ticket, visita=deep link por geocerca). Servicios de
mutación extraídos (`tickets-transition`/`tickets-mutations`). Migración aditiva
`20261005000000_ticket_slack_thread`.

Verificación de aislamiento: tenant por `getTenantForTeam`, identidad por
`resolveLinkedAdmin`, mutaciones con `source:"slack"` + `logAudit`; eliminar
excluido (solo Cerrar/Cancelar). QA = estático + tsc verde por bloque; la prueba
en vivo requiere tenant Slack conectado + usuario vinculado (matriz en docs).

## Bloques
- [x] BLOQUE 1 — Registro + hub (+ migrar ticket/rendición F5)
- [x] BLOQUE 2 — Servicios de mutación de tickets
- [x] BLOQUE 3 — Bandeja Mis tickets + acciones por fila
- [x] BLOQUE 4 — Pendientes de mi aprobación
- [x] BLOQUE 5 — Hilo por ticket
- [x] BLOQUE 6 — Comentarios desde el hilo
- [x] BLOQUE 7 — Visita de supervisor (deep link por geocerca)
- [x] BLOQUE 8 — Ingreso turno extra
- [x] BLOQUE 9 — Vacaciones (tipo de ticket)
- [x] BLOQUE 10 — QA + docs
