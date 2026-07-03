# Integración Slack — Fase 1

Notificaciones salientes del catálogo unificado de OPAI hacia canales de Slack,
multi-tenant estricto. Una sola Slack App global; cada tenant instala el bot en
su propio workspace vía OAuth.

## Arquitectura (diagrama en texto)

```
notify(params)                     [src/lib/notifications/notify.ts]
  └─ after(() => dispatchSlackForNotification(...))   (no bloquea la respuesta)
        │
        ▼
dispatchSlackForNotification       [src/lib/integrations/slack/dispatch.ts]
  1. getWorkspaceForTenant(tenantId) ──► null ⇒ return (tenant sin Slack)
  2. resolveChannel: KEY(typeDef.key) > MODULE(typeDef.module) > defaultChannelId
  3. buildNotificationBlocks(...)   [blocks.ts]  → { text, blocks } Block Kit
  4. SlackOutbox.create(PENDING, dedupeKey)  ── unique choca ⇒ return
  5. slackPostMessage(...) ─ ok ⇒ SENT · error ⇒ FAILED (lo retoma el cron)

cron */2 min  /api/cron/flush-slack-outbox
  └─ PENDING|FAILED con attempts<5 ─► reintento ─► SENT | attempts++ + lastError

Entrantes (Slack → OPAI):
  /api/integrations/slack/events   (firma HMAC v0 in-route)
     ├─ url_verification ⇒ { challenge }
     ├─ getTenantForTeam(team_id)  ◄── FRONTERA DE AISLAMIENTO
     ├─ app_uninstalled | tokens_revoked ⇒ markWorkspaceRevoked
     └─ app_mention | message ⇒ 200 (respuesta del bot: Fase 2)
```

## Modelos (schema `public`)

- **SlackWorkspace** — 1 por tenant (`tenantId` y `slackTeamId` únicos). Token del
  bot cifrado (`botTokenEnc`, AES-256-GCM con `SLACK_TOKEN_ENCRYPTION_KEY`).
- **SlackChannelRoute** — ruteo `KEY | MODULE` → canal, `enabled`, único por
  `(tenantId, matchType, matchValue)`.
- **SlackOutbox** — cola de entrega (`PENDING | SENT | FAILED`, `attempts`,
  `dedupeKey` único, `slackTs`).
- **SlackUserLink** — vínculo usuario Slack ↔ Admin. Creado ahora, poblado en Fase 2.

Migración aditiva: `prisma/migrations/20260930000000_slack_integration/migration.sql`
(`CREATE TABLE/INDEX IF NOT EXISTS`, sin DROP/ALTER destructivo).

## Flujo OAuth (v2, por tenant)

1. `GET /api/integrations/slack/oauth/start` — `requireAuth` + rol admin. Firma un
   `state` = `signCookie({ tenantId, adminId, nonce, exp: now+10min })`, lo guarda
   en cookie httpOnly y redirige a `slack.com/oauth/v2/authorize`.
2. `GET /api/integrations/slack/oauth/callback` — valida `state` (firma + cookie +
   exp), intercambia `code` (`oauth.v2.access`), y hace **upsert** de
   `SlackWorkspace` por `tenantId`. Si el `slackTeamId` ya pertenece a **otro**
   tenant ⇒ `?error=workspace_taken` y no se sobreescribe. Registra `logAudit`.

`redirect_uri` se centraliza en `config.ts` (`slackRedirectUri()`) para que
authorize y token-exchange usen exactamente el mismo valor (Slack los compara).

Scopes del bot (deben coincidir con el manifest): `chat:write`,
`chat:write.public`, `channels:read`, `groups:read`, `users:read`,
`users:read.email`, `app_mentions:read`, `commands`.

## Resolución team → tenant

La **única** frontera de aislamiento entrante es `slack_team_id →
SlackWorkspace.tenantId` (`getTenantForTeam`). Ningún handler confía en IDs del
payload para saltarse esta resolución. Team desconocido ⇒ `200` silencioso
(nunca `4xx` a Slack).

## Formato de rutas y precedencia

Al despachar una notificación se elige el canal con precedencia:

1. **KEY** — regla exacta por `typeDef.key` (ej. `new_lead`).
2. **MODULE** — regla por módulo (ej. `finance`, `ops`, `crm`).
3. **defaultChannelId** del workspace.

Sin ninguna coincidencia ⇒ no se envía nada.

## Middleware (`src/proxy.ts`)

`src/proxy.ts` devuelve 401 a todo `/api/*` sin sesión NextAuth. Se agregan como
públicos SOLO los endpoints entrantes (seguridad in-route): `events`,
`interactivity`, `commands`, `oauth/callback`. Las rutas de configuración
(`config`, `channels`, `routes`, `test`) y `oauth/start` permanecen tras NextAuth.

## Env vars (ya cargadas en Vercel)

`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`,
`SLACK_TOKEN_ENCRYPTION_KEY`. El cron usa `CRON_SECRET` (Bearer).

## Cómo probar localmente

1. Exponer localhost con un túnel (ej. `ngrok http 3000`); usar la URL en
   `PUBLIC_APP_URL` y en el manifest de la Slack App (redirect + Event URL).
2. Panel: `/opai/configuracion/integraciones/slack` → **Conectar con Slack**.
3. Elegir canal por defecto → **Enviar prueba** (envía la tarjeta "✅ OPAI
   conectado correctamente" vía outbox y muestra el resultado real).
4. Definir una regla por evento (ej. `new_lead`) y disparar un `notify()`
   (crear un lead). Debe llegar una tarjeta Block Kit con botón "Ver en OPAI".
5. Reintentos: si el envío inmediato falla, el cron
   `*/2 * * * *` (`/api/cron/flush-slack-outbox`) lo reintenta (máx 5).

## Troubleshooting de errores de Slack

- **`invalid_auth`** — token inválido o revocado. Reconectar desde el panel.
- **`channel_not_found`** — el `channelId` no existe / el bot no lo ve; refrescar
  la lista de canales (caché de 5 min por workspace).
- **`not_in_channel`** — el bot no es miembro del canal privado. Invitarlo
  (`/invite @OPAI`) o usar canales públicos (`chat:write.public` cubre públicos).
- **`workspace_taken`** (OPAI) — ese workspace ya está conectado a otra
  organización; un `slackTeamId` sólo puede pertenecer a un tenant.

## Checklist post-deploy

- [ ] Migración `20260930000000_slack_integration` aplicada.
- [ ] Env vars presentes en el entorno de producción.
- [ ] Slack App > **OAuth & Permissions** > Redirect URL =
      `https://www.opai.cl/api/integrations/slack/oauth/callback`.
- [ ] Slack App > **Event Subscriptions** > Request URL =
      `https://www.opai.cl/api/integrations/slack/events` (verificada, muestra
      "Verified" tras el handshake `url_verification`).
- [ ] Eventos suscritos: `app_uninstalled`, `tokens_revoked`, `app_mention`,
      `message.im` (los dos últimos para Fase 2).
- [ ] Cron `flush-slack-outbox` visible en Vercel > Crons.
- [ ] Prueba end-to-end: conectar un tenant, rutear `new_lead`, crear un lead,
      confirmar la tarjeta en el canal.

---

# Integración Slack — Fase 2 (OPAI Intelligence)

Lleva el asistente OPAI Intelligence (help-chat v2) a Slack: responde menciones
`@OPAI` y DMs, ejecuta el MISMO motor de tools del chat web con los permisos del
Admin vinculado, confirma escrituras con botones, aprueba tickets desde la
tarjeta y expone el slash command `/opai`.

## Componentes nuevos

| Pieza | Archivo |
|-------|---------|
| Runner no-streaming | `src/lib/ai/help-chat-runner.ts` |
| Helpers compartidos | `src/lib/ai/help-chat-shared.ts` |
| Vínculo usuario↔Admin | `src/lib/integrations/slack/user-link.ts` |
| Ruta de vínculo manual | `src/app/api/integrations/slack/link/route.ts` |
| Bot (menciones/DM) | `src/lib/integrations/slack/bot.ts` |
| Markdown → mrkdwn | `src/lib/integrations/slack/markdown.ts` |
| Interactividad (botones) | `src/lib/integrations/slack/interactivity.ts` + `.../interactivity/route.ts` |
| Slash command `/opai` | `src/lib/integrations/slack/commands.ts` + `.../commands/route.ts` |
| Servicio aprobación ticket | `src/lib/tickets-approvals.ts` (reusado por el route ops y Slack) |
| Modelos | `SlackBotThread`, `SlackPendingAction` (migración `20261001000000`) |

## Flujo del bot (mención / DM)

```
Slack Event (app_mention | message.im)   [.../events/route.ts]
  1. verifySlackSignature(rawBody)  → 401 si no calza
  2. ACK 200 inmediato            ← Slack exige <3s
  3. after(() => handleBotEvent(teamId, event))       [bot.ts]
        a. getTenantForTeam(teamId) → getWorkspaceForTenant(tenantId)
        b. ignora bot_id / subtypes / el propio botUserId
        c. resolveLinkedAdmin(workspace, slackUserId)
             └─ sin vínculo ⇒ buildLinkPrompt (botón firmado) y termina
        d. publica placeholder "⏳ Consultando OPAI…"
        e. carga transcript de SlackBotThread (memoria por thread)
        f. runHelpChatTurn(...) con permisos del admin vinculado
        g. chat.update del placeholder con la respuesta (toSlackMarkdown)
             └─ si pendingConfirmation ⇒ crea SlackPendingAction + botones
        h. guarda el turno en el transcript (cap 24 turnos / 24k chars)
```

## La regla de los 3 segundos y `after()`

Slack corta la request si no recibe un 200 en 3 s. Todas las rutas entrantes
(events, interactivity, commands) responden 200 de inmediato y hacen el trabajo
pesado (LLM, tools, posteo) dentro de `after()` de `next/server`, publicando o
actualizando el mensaje por la Web API cuando el resultado está listo. Por eso
las tres rutas declaran `maxDuration: 60` en `vercel.json`.

## Vínculo de usuarios

- **Automático por email**: al primer contacto, `resolveLinkedAdmin` obtiene el
  email vía `users.info` (scope `users:read.email`) y busca un `Admin` activo del
  tenant por email (case-insensitive). Si hay match crea el `SlackUserLink`.
- **Manual firmado**: sin match, el bot responde con un botón a
  `/api/integrations/slack/link?token=…`. El token (`signCookie`, TTL 15 min)
  transporta `{workspaceId, slackUserId, exp}`. La ruta **exige sesión OPAI**
  (no es pública en el proxy; si no hay sesión el proxy redirige a login) y valida
  que el tenant de la sesión == tenant del workspace antes de crear el vínculo.
- **Sin vínculo = cero datos**: un usuario no vinculado nunca recibe información;
  sólo el flujo de vinculación.

Los permisos SON los del Admin vinculado (`resolvePermissionsById`), nunca los del
bot. `allowWrites` del tenant se respeta igual que en el chat web.

## Confirmaciones de escritura (preview/confirm)

En Slack **toda escritura se difiere**. El runner (`deferWrites = allowWrites`):

- Ejecuta las tools `preview_*` (sólo calculan, no persisten) para mostrar montos
  reales, y deja pendiente la escritura mapeada en `PREVIEW_TO_CONFIRM`.
- Intercepta las tools de escritura directas (`create_lead`, `create_account`, …
  en `WRITE_TOOL_NAMES`) sin ejecutarlas, y las expone como `pendingConfirmation`.

La respuesta muestra una tarjeta con botones **Confirmar** / **Cancelar**
(`action_id` `pending_confirm` / `pending_cancel`). Los args de la tool de
escritura se guardan en `SlackPendingAction` (kind `TOOL_CONFIRM`, expira 15 min).
Al **Confirmar**, la interactividad ejecuta `executeToolCallV2` con la identidad y
permisos del usuario que PRESIONA (que también debe estar vinculado) y actualiza
la tarjeta a "✅ Confirmado por @usuario". Si la tool devuelve error de permiso,
la acción se mantiene PENDING y se responde efímero con el motivo.

> Limitación: `create_recurring_invoice` requiere `previewToken` (cache en memoria)
> y puede no sobrevivir entre la vista previa y la confirmación en serverless; el
> resto de escrituras se re-ejecutan con los args guardados.

## Aprobación de tickets desde Slack

Cuando `notify()` emite `ticket_needs_approval`, el dispatch adjunta botones
**Aprobar** / **Rechazar** sobre una `SlackPendingAction` (kind `TICKET_APPROVAL`,
`entityId` = `ticketId` extraído de `params.data.ticketId`) anclada al mensaje
publicado. Al decidir, la interactividad valida los permisos de Operaciones del
admin vinculado y reutiliza `decideTicketApproval` (la MISMA máquina de estados
del route `POST /api/ops/tickets/[id]/approvals`, extraída a `tickets-approvals.ts`).

## Expiración

El cron `flush-slack-outbox` (cada 2 min) marca `EXPIRED` las `SlackPendingAction`
`PENDING` cuyo `expiresAt` ya pasó (paso 0, antes de reintentar envíos). Las
tarjetas caducadas/resueltas, al presionarse, se actualizan a "⌛ Esta acción ya
expiró o fue resuelta".

## Aislamiento multi-tenant

La frontera sigue siendo `slack_team_id → tenantId`. Interactividad, comandos y
eventos SIEMPRE resuelven el tenant con `getTenantForTeam` + `getWorkspaceForTenant`
y validan que el recurso (`SlackPendingAction`, `Admin`, `OpsTicket`) pertenezca a
ese tenant antes de usarlo. Ningún ID del payload de Slack se usa sin ese pasaje.

## Panel de configuración

La página de Slack agrega la sección **Usuarios vinculados** (lista de
`SlackUserLink` con Admin y fecha, botón desvincular) y un indicador del estado
`allowWrites` del asistente con enlace a `/opai/configuracion/asistente-ia`. Las
rutas nuevas (`/api/integrations/slack/users`) usan `requireSlackAdmin`.

## Troubleshooting (Fase 2)

- **El bot no responde a menciones** — verificar suscripción a `app_mention` y
  que el bot esté invitado al canal; revisar logs de `handleBotEvent`.
- **"Vincula tu cuenta OPAI" en loop** — el email de Slack no coincide con ningún
  Admin activo del tenant; usar el enlace firmado estando logueado en OPAI.
- **Botón Confirmar no hace nada** — la acción expiró (15 min) o el que presiona no
  está vinculado / sin permiso para esa tool; se responde efímero con el motivo.
- **`invalid_signature`** — `SLACK_SIGNING_SECRET` no coincide, o un proxy alteró
  el raw body antes de la verificación.

## Limitaciones conocidas (Fase 2)

- **Escrituras encadenadas en un turno**: si el modelo pide dos escrituras a la
  vez (ej. crear cuenta y luego contacto), sólo la ÚLTIMA queda como tarjeta de
  confirmación (last-wins). Nada se persiste sin confirmar, así que el peor caso
  es una confirmación que falla limpiamente (ej. accountId inexistente), nunca
  datos corruptos. Para flujos multi-entidad, usar el chat web.
- **Aprobaciones multi-paso**: los botones se adjuntan al evento
  `ticket_needs_approval` (creación). Al avanzar de paso se notifica al siguiente
  aprobador con `ticket_approved` (sin botones); ese paso se decide desde la web.
- **Memoria por thread bajo ráfagas**: `SlackBotThread` es read-modify-write sin
  lock; dos mensajes casi simultáneos en el mismo thread pueden perder un turno
  del historial (last-write-wins). No afecta datos, sólo memoria conversacional.
- **`create_recurring_invoice`**: depende de un `previewToken` en caché de memoria
  que puede no sobrevivir entre la vista previa y la confirmación en serverless.

## Checklist post-deploy (Fase 2)

- [ ] Migración `20261001000000_slack_bot_and_pending_actions` aplicada.
- [ ] Slack App > **Interactivity & Shortcuts** > Request URL =
      `https://www.opai.cl/api/integrations/slack/interactivity`.
- [ ] Slack App > **Slash Commands** > `/opai` → Request URL =
      `https://www.opai.cl/api/integrations/slack/commands`.
- [ ] Eventos suscritos: `app_mention` y `message.im`.
- [ ] Scope `users:read.email` presente (vínculo por email).
- [ ] Prueba: `@OPAI ¿cómo viene la caja del mes?` responde en el thread; crear un
      lead pide confirmación con botones; aprobar un ticket desde la tarjeta.
