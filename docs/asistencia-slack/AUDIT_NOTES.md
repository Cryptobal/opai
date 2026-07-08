# Control de Asistencia operado desde Slack — Notas de auditoría (Bloque 0)

Verificación de los símbolos citados en el prompt contra el código real. Donde el
código difiere del prompt, **la realidad manda** y se deja constancia aquí.

## Símbolos verificados (existen tal cual)

- `resolveInstallationSlackChannel(tenantId, installationId)` y
  `RONDA_INSTALLATION_ROUTE_KEYS` → `src/lib/integrations/slack/installation-channel.ts`.
- `resolveSlackSharedChannelDestination` + ruteo a instalación (líneas ~130-141) →
  `src/lib/integrations/slack/dispatch.ts`. También `resolveChannel(tenantId, typeDef, defaultChannelId)`.
- `buildNotificationBlocks`, `toContextFields` → `src/lib/integrations/slack/blocks.ts`.
- `notify(...)` → `dispatchSlackForNotification` → `src/lib/notifications/notify.ts`.
- `UNIFIED_NOTIFICATION_TYPES`, `adminBell(email=false)` → `src/lib/notifications/catalog.ts`.
- `handleInteractivity(payload)` con cadena de `actionId.startsWith(...)` →
  `src/lib/integrations/slack/interactivity.ts`.
- `ModalDef`, `ModalOpenContext`, `ModalSubmitContext` → `src/lib/integrations/slack/modals/types.ts`.
- `slackPostMessage`, `slackUpdateMessage` → `src/lib/integrations/slack/api.ts`.
- Template de acción con servicio compartido + `logAudit` + `hasModuleAccess` →
  `src/lib/integrations/slack/actions/turno-extra.ts`.
- `ACTIONS: ActionDef[]` → `src/lib/integrations/slack/actions/registry.ts`.
- Schema: `OpsAsistenciaDiaria` (~4348), `OpsPuestoOperativo` (~3753), `OpsPautaMensual`
  (~3796), `OpsMonitoreoTurno` (~5238), `OpsControlNocturno` (~4998) +
  `OpsControlNocturnoInstalacion` (~5035), `CrmDealSlackRoom` (~11395), `SlackOutbox` (~11274).
- Endpoints de marca (4) + cierre de rondas + control nocturno: todos presentes.
- Helpers de zona horaria Chile → `src/lib/rondas/timezone.ts` (`startOfDayChile`, etc.).

## Diferencias respecto al prompt (la realidad manda)

1. **Rama:** se desarrolla en `claude/asistencia-slack-central-2dtzae` (rama designada por
   el harness), no en `feat/asistencia-slack-central`.
2. **Apertura de modal:** el prompt cita `slackOpenModal(triggerId, view, token)`; la función
   real es `slackOpenView(token, triggerId, view)` (api.ts). El `trigger_id` igual vence ~3s.
3. **Ruteo de `view_submission`:** NO se registra en `interactivity.ts`. Los modales se
   resuelven por `callbackId` en `src/lib/integrations/slack/modals/registry.ts` y se
   despachan en `modals/dispatch.ts` (`prepareViewSubmission`). El nuevo modal
   `opai_asist_camino` se registra en `modals/registry.ts`.
4. **Firmas `slackPostMessage` / `slackUpdateMessage`:** el `token` es el PRIMER argumento:
   `slackPostMessage(token, {channel, text, blocks, thread_ts?})` y
   `slackUpdateMessage(token, {channel, ts, text, blocks})`.
5. **Prisma 6.19.2** (no 7.x). `npx prisma` intenta bajar 7.8.0 → usar el binario local
   `./node_modules/.bin/prisma`. Gate real: `./node_modules/.bin/prisma generate && ./node_modules/.bin/tsc --noEmit`.
6. **Blocks custom por evento:** `dispatch.ts` no tenía hook para blocks enriquecidos por
   evento. Se extiende mínimamente `dispatchSlackForNotification` para aceptar
   `data.__customBlocks` (Bloque 3).

## Línea base

`./node_modules/.bin/prisma generate && ./node_modules/.bin/tsc --noEmit` → verde.
