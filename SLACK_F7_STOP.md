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

## Bloques
- [ ] BLOQUE 1 — Registro + hub (+ migrar ticket/rendición F5)
- [ ] BLOQUE 2 — Servicios de mutación de tickets (si el audit lo exige)
- [ ] BLOQUE 3 — Bandeja Mis tickets + acciones por fila
- [ ] BLOQUE 4 — Pendientes de mi aprobación
- [ ] BLOQUE 5 — Hilo por ticket
- [ ] BLOQUE 6 — Comentarios desde el hilo (opcional-condicionado)
- [ ] BLOQUE 7 — Visita de supervisor
- [ ] BLOQUE 8 — Ingreso turno extra
- [ ] BLOQUE 9 — Vacaciones (condicionado al audit)
- [ ] BLOQUE 10 — QA + docs
