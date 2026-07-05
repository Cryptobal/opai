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

---

# Fase 4 — Puente bidireccional de canales

Conecta un canal del chat de OPAI con un canal de Slack: lo que se escribe en
OPAI aparece en Slack con el nombre y avatar reales de cada persona, y lo que se
escribe en Slack aparece en OPAI en vivo. Relación **1:1** (un canal OPAI ↔ un
canal Slack), sin fan-out en v1.

## Cómo funciona

- **OPAI → Slack** (`bridge-outbound.ts`): tras cada envío en las 3 rutas de chat
  (admin, portal guardia, portal cliente) se llama `mirrorChatMessageToSlack` en
  `after()`. Publica con `chat.postMessage` usando `username` (con sufijo de rol:
  `"Pedro Soto · Guardia"`, `"María Díaz · Cliente"`; los admins van con su
  nombre) e `icon_url` = avatar si es URL absoluta. Requiere scope
  `chat:write.customize`.
- **Slack → OPAI** (`bridge-inbound.ts`): los eventos `message` de canales
  `channel`/`group` puenteados crean un `ChatMessage` y emiten el evento Pusher
  `new-message`/`thread-reply` (mismo shape que la ruta admin) para que la UI lo
  pinte al instante. Los `im` siguen yendo al bot conversacional.
- **Identidad entrante**: si el usuario de Slack está en `SlackUserLink` → entra
  como su propio Admin (`senderType ADMIN`); si no, como `senderType SLACK` con su
  display name y avatar (via `users.info`, cacheado 10 min).
- **Hilos**: mapeados por `SlackBridgeMessageMap` (mensaje OPAI ↔ `ts` de Slack).
  Respuesta en hilo en cualquier lado mantiene el hilo en el otro; sin map del
  root, el mensaje sale suelto.
- **Adjuntos v1**: como links en el texto (OPAI→Slack: URLs de `attachments`;
  Slack→OPAI: permalink con nota "(archivo en Slack)"). Ediciones, borrados y
  reacciones quedan fuera de v1.
- **Transparencia**: al crear un puente se publica un aviso en ambos lados; al
  desconectarlo, otro. Guardias y contactos de cliente saben que sus mensajes se
  leen en Slack.

## Vinculación rápida desde el chat (Fase 4.1)

Un admin puede puentear un canal **sin salir del chat**: en el menú de tres puntos
del canal aparece "Vincular con Slack" (icono `Link2`), que abre un modal para
elegir el canal de Slack y conectar. Si el canal ya está puenteado, el menú muestra
"Conectado con #nombre" + "Desconectar de Slack" (con confirmación) y la fila luce un
icono `Link2` junto al nombre. La página `/opai/configuracion/integraciones/slack`
sigue siendo la vista global de puentes.

- **Piezas**: `useSlackBridges()` (`src/components/chat/useSlackBridges.ts`) carga
  una vez por montaje `config` (workspace activo) + `bridges` y expone
  `bridgeByChatChannelId`; `ChatChannelSlackBridge.tsx` es el modal (conectar) +
  confirmación (desconectar). El ítem se inyecta en el menú por canal de
  `ChatSidePanel` (secciones con "Archivar": instalaciones-reportes, prospectos,
  clientes, archivados) y de `ChatChannelListItem` (lista full-page).
- **Gate de visibilidad**: el ítem aparece sólo si el viewer es `owner`/`admin`
  (el mismo check que `requireSlackAdmin` enforce en el API de bridges), hay
  workspace Slack ACTIVO y el canal **no** es DM. El hook ni siquiera llama a los
  endpoints si el viewer no es admin. El ocultamiento es **cosmético**: la
  seguridad real vive en `requireSlackAdmin` + `tenantId` del API. Un no-admin ve
  el menú exactamente como antes.
- **Endpoints**: reutiliza `GET config`, `GET bridges`, `GET channels`,
  `POST bridges`, `DELETE bridges?id=`. No hay rutas de mutación nuevas. Los errores
  accionables del POST (ej. "Escribe `/invite @OPAI` en el canal") se muestran tal
  cual vía toast.

## Anti-loop (revisión Bloque 6)

Ningún camino re-espeja un mensaje ya espejado. Dos capas:

1. **El saliente sólo se dispara desde las 3 rutas HTTP de chat.** Los mensajes
   creados por `bridge-inbound` NO pasan por `mirrorChatMessageToSlack`, así que
   un mensaje que entró de Slack nunca vuelve a salir a Slack — incluso cuando
   entra como `senderType ADMIN` (usuario vinculado).
2. **Filtros redundantes de tipo/origen.** El saliente ignora `senderType` `SLACK`
   y `SYSTEM`. El entrante ignora todo evento con `bot_id` o `subtype`: como el
   saliente publica con el token del bot, Slack reemite ese mensaje con `bot_id`
   y el entrante lo descarta. Dedupe adicional por unique `(slackChannelId,
   slackTs)`: los reintentos de Slack chocan P2002 y abortan en silencio.

## Volumen (revisión Bloque 6)

En `handleInboundSlackMessage` el orden es barato→caro: (1) `bot_id`/`subtype`
sin query; (2) validación de campos; (3) `resolveLinkBySlack` (cache 60s) — es la
**primera** query y si el canal no tiene puente hace `return` ANTES de resolver
token, identidad o transacción. Un canal sin puente cuesta, tras el primer
evento, una lectura de cache en memoria.

## Matriz de pruebas manuales

| Caso | Esperado |
| --- | --- |
| Admin escribe en canal OPAI puenteado | Aparece en Slack con su nombre (sin sufijo) |
| Guardia (portal) escribe | Aparece en Slack como "Nombre · Guardia" con su avatar |
| Contacto cliente (portal) escribe | Aparece como "Nombre · Cliente" |
| Alguien escribe en el canal de Slack | Aparece en OPAI en vivo (Pusher) con su nombre/avatar |
| Respuesta en hilo en OPAI | Cae en el hilo correcto en Slack |
| Respuesta en hilo en Slack | Cae en el hilo correcto en OPAI |
| El bot re-emite el mensaje espejado | NO rebota (bot_id / senderType) |
| Reintento de evento de Slack | NO duplica (unique slackTs) |
| Usuario de Slack vinculado escribe | Entra en OPAI como su propio Admin |
| Crear puente | Aviso de transparencia en ambos canales |
| Desconectar puente | Aviso en ambos lados; deja de espejar de inmediato |
| Canal de Slack sin invitar al bot | POST 400: "Escribe /invite @OPAI en el canal" |
| Admin abre menú del canal en el chat | Ve "Vincular con Slack"; tras conectar, "Desconectar" + icono Link2 |
| No-admin abre el menú del canal | No ve el ítem de Slack ni el icono; el menú luce como antes |
| Menú del canal en un DM | Sin ítem de Slack (solo canales, no DMs) |
| Vincular/desvincular a 375px | Menú y modal usables; SearchableSelect a ancho completo |

## Checklist post-deploy (Fase 4)

- [ ] Migración `20261003000000_slack_channel_bridge` aplicada (incluye
      `ALTER TYPE chat."ChatSenderType" ADD VALUE 'SLACK'`).
- [ ] Scopes del bot: `chat:write.customize`, `channels:history`, `groups:history`.
- [ ] Eventos suscritos: `message.channels`, `message.groups`.
- [ ] Workspace **reconectado** tras agregar los scopes (si no, `missing_scope`).
- [ ] Bot invitado (`/invite @OPAI`) en cada canal de Slack a puentear.
- [ ] Prueba end-to-end de la matriz de arriba en un canal real.

---

# Fase 5 — Acciones nativas (tickets, rendiciones, modales) + imágenes en el puente

Convierte Slack en superficie de acción de OPAI: imágenes reales en el puente,
crear tickets desde cualquier mensaje, y rendiciones de gasto con boleta — todo
con la identidad y permisos reales del usuario vinculado y aislado por tenant.

## Imágenes/archivos en el puente

- **OPAI → Slack** (`bridge-blocks.ts`): los `fileUrl` del chat son URLs públicas y
  estables (R2 `files.gard.cl`), así que las imágenes salen como `image` blocks
  apuntando directo a la URL — sin re-subir binario. Los no-imagen siguen como
  link `📎`. Si `chat:write.customize` falta, el fallback mantiene las imágenes y
  antepone la identidad en el texto.
- **Slack → OPAI** (`bridge-inbound-files.ts`): `event.files` → descarga con
  `files:read` (Bearer sobre `url_private`) → `uploadFile(..., "chat", tenantId)` a
  R2 → `attachments` con el shape `ChatAttachment` que la UI ya pinta (cero cambios
  de frontend). Límites: **máx 5 archivos, 10 MB c/u, sólo imágenes y PDF**; el
  resto queda como link al permalink.

## Modales (shortcuts + slash + view_submission)

- Cliente ampliado (`api.ts`): `slackOpenView`/`slackUpdateView`; `files.ts`:
  `slackDownloadFile` (GET Bearer) y `slackFilesUpload` (external upload).
- Infraestructura (`modals/`): `registry.ts` (registro por `callbackId`),
  `dispatch.ts` (abrir + `view_submission`), `views.ts` (loading/info/link +
  pack/unpack de `private_metadata`), `types.ts`, y un modal por archivo
  (`ticket.ts`, `rendicion.ts`).
- **ACK de 3s**: `shortcut`/`message_action` abren un modal de **carga** de
  inmediato (el `trigger_id` vence en ~3s) y luego resuelven identidad/permiso y
  hacen `views.update` con el formulario real. `view_submission` responde el ACK
  (cerrar o `response_action:"errors"` por campo) **síncrono** en la ruta y difiere
  la creación a `after()`.
- **Registro de subcomandos** (`subcommands.ts`): `/opai ayuda` se genera del
  registro; `ticket`/`rendicion` abren los mismos modales (usan el `trigger_id` del
  slash command).

## Crear ticket / rendición (servicios únicos)

Para no duplicar lógica, la creación vive en servicios compartidos por la web y
Slack: **`createOpsTicket`** (`src/lib/tickets-create.ts`, + `tickets-notify.ts`)
y **`createRendicion`** (`src/lib/rendiciones-create.ts`). Las rutas
`POST /api/ops/tickets` y `POST /api/finance/rendiciones` fueron refactorizadas
para delegar en ellos.

- Ticket: shortcut de mensaje `opai_crear_ticket` (título prellenado con el texto),
  tipo (catálogo `OpsTicketType` origin internal/both), prioridad p1-p4, descripción.
  Gate: módulo `ops`. Al crear responde en el **hilo** del mensaje: `🎫 <folio>` +
  botón "Ver en OPAI" (`/ops/tickets/{id}`) + `logAudit`.
- Rendición: shortcut global `opai_nueva_rendicion` o `/opai rendicion` (monto CLP,
  fecha, categoría `FinanceRendicionItem`, descripción, `file_input` de boleta).
  Gate: `canEdit(perms,"finance","rendiciones")`. Crea en estado **DRAFT**, adjunta
  la(s) boleta(s) a R2 vía `FinanceAttachment` (`RECEIPT`), y confirma por **DM** con
  link (`/finanzas/rendiciones/{id}`) + `logAudit`.

## Aislamiento (verificación escrita, Bloque 8)

Ningún handler de Fase 5 usa datos del payload para saltarse la resolución de
tenant/identidad:

- **Tenant**: `openModalByCallback` y `prepareViewSubmission` resuelven SIEMPRE por
  `getTenantForTeam(payload.team.id)` → `getWorkspaceForTenant`. `ctx.tenantId` es
  `workspace.tenantId`; los servicios (`createOpsTicket`/`createRendicion`) reciben
  ese tenant, nunca uno del payload.
- **`private_metadata` = contexto, no autoridad**: sólo transporta `channelId`/
  `messageTs` (para responder en el hilo). El campo `tenantHint` no se setea ni se
  lee para scoping — el tenant se re-resuelve por `team_id`.
- **Identidad**: SIEMPRE `resolveLinkedAdmin(workspace, slackUserId)`. `actorId`/
  `reportedBy`/`submitterId`/`uploadedById` son el `adminId` vinculado. Sin vínculo
  → modal de vinculación (o silencioso en submit). El permiso (`requires`) se chequea
  al **abrir** y se **re-valida** al enviar.

## Matriz de pruebas manuales (Fase 5)

| Caso | Esperado |
| --- | --- |
| Guardia sube foto en canal OPAI puenteado | El supervisor la VE como imagen en Slack |
| Supervisor responde con foto en Slack | El guardia la ve en su portal (adjunto real) |
| Archivo no-imagen (>10 MB o tipo raro) | Entra/sale como link `📎`, no como imagen |
| Shortcut "Crear ticket en OPAI" sobre un mensaje | Modal prellenado; al crear, `🎫 folio` en el hilo + botón |
| Usuario sin acceso a `ops` abre el shortcut de ticket | Modal informa "sin permiso"; no crea nada |
| Shortcut global "Nueva rendición" con boleta | Rendición DRAFT en OPAI con la boleta adjunta; DM de confirmación |
| `/opai rendicion` | Abre el mismo modal de rendición |
| Usuario sin vínculo dispara cualquier shortcut | Modal con el flujo de vinculación |
| `/opai ayuda` | Lista generada del registro (incluye ticket y rendición) |
| Trigger vencido (>3s) | Log `views.open falló`; sin efecto (reintentar) |

## Checklist post-deploy (Fase 5)

- [ ] Scopes del bot: `files:read`, `files:write` (además de los previos).
- [ ] Shortcuts en el manifest: `opai_crear_ticket` (message), `opai_nueva_rendicion`
      (global).
- [ ] Workspace **reconectado** tras agregar scopes/shortcuts (si no, `missing_scope`
      en descargas o el shortcut no aparece).
- [ ] `/opai` (Slash Commands) ya apuntando a `…/commands` (Fase 2) — sin cambios.
- [ ] Prueba end-to-end de la matriz de arriba con un tenant real conectado.

---

# Fase 6 — Canal Slack PERSONAL (DM del bot) en Mis Notificaciones

Quinto canal personal, además del ruteo tenant→canal compartido: cuando un admin
activa el canal `slack` para un tipo en **Perfil → Mis Notificaciones**, esa
notificación le llega como **DM del bot OPAI**. Opt-in, **default OFF** para todos
los tipos (nadie recibe spam por sorpresa).

## Cómo funciona

- **Preferencia**: `NotificationPreference.preferences[typeKey].slack` (JSON aditivo;
  sin migración de columna). `resolvePrefs` la resuelve y **la apaga en No molestar**
  igual que push (salvo tipos `critical`).
- **Despacho** (`notify.ts`, dentro del loop de recipients, tras la rama push):
  si `eff.slack && subType === 'ADMIN'` → `dispatchPersonalSlackDm` (`personal-dm.ts`).
  Resuelve el workspace por `tenantId`, el `SlackUserLink` por `adminId`, cachea el
  `dmChannelId` (`conversations.open` → `slackOpenDm`), arma la tarjeta con
  `buildNotificationBlocks` y **reusa `SlackOutbox`** (helpers `outbox.ts`: encolar +
  enviar; el cron `flush-slack-outbox` reintenta los transitorios, descarta los
  permanentes). **Sin duplicar**: si `dispatchSlackForNotification` publicará en
  un canal compartido (ruteo KEY/CATEGORY/MODULE, canal default, sala de deal,
  hilo de ronda o puente de instalación), `notify()` omite el DM personal aunque
  el usuario tenga opt-in Slack activo.
- **Aislamiento**: tenant por `getTenantForTeam`/`getWorkspaceForTenant`; identidad por
  `SlackUserLink`. Sin vínculo → no hay DM (la UI ya deshabilita la columna). Solo
  admins (los portales no tienen vínculo).

## UI (Mis Notificaciones)

- 5ª columna Slack con 3 estados: (a) **activa** si el usuario tiene vínculo; (b)
  **deshabilitada + CTA** "vincula tu Slack (DM al bot OPAI)" si hay workspace pero
  sin vínculo; (c) **oculta** si el tenant no tiene workspace ACTIVO.
- **Acciones masivas** (`channels.tsx`): headers de columna clickeables por módulo
  con estado **tri-state** (todas/algunas/ninguna) y menú "Solo este canal"
  (Solo campana / email / push / Slack). Todo persiste por el **mismo endpoint batch**
  (`PUT /api/notifications/preferences`, mapa completo) — sin endpoints nuevos.
- Mobile 375px: el cluster de toggles es `shrink-0` con `gap-1.5`; el label trunca.

## Matriz de pruebas manuales (Fase 6)

| Caso | Esperado |
| --- | --- |
| Activar Slack para un tipo → disparar el evento | Llega DM del bot con la tarjeta + botón "Ver en OPAI" |
| Estar en No molestar (tipo no crítico) | El DM NO llega (igual que push); crítico sí |
| Usuario sin `SlackUserLink` | Columna Slack deshabilitada con CTA "vincula tu Slack" |
| Tenant sin workspace Slack activo | La columna Slack no se muestra |
| "Solo Slack" en Operaciones | Deja Slack ON y campana/email/push OFF en todos los tipos del módulo |
| Header de columna (tri-state) | 1 clic enciende toda la columna; con todas ON, apaga |
| 375px (iPhone) | Menú, headers y 5 toggles usables; el nombre del tipo trunca |
| Reintento del outbox | El cron `flush-slack-outbox` reenvía el DM transitorio; permanente se descarta |

## Checklist post-deploy (Fase 6)

- [ ] Migración `20261004000000_slack_user_link_dm` aplicada (columna `dm_channel_id`).
- [ ] Scope del bot que permita DMs (`chat:write` ya cubre `im`; `conversations.open`
      no requiere scope extra para el bot). Verificar que el bot puede abrir DM.
- [ ] Prueba: vincular un usuario, activar Slack para `new_lead`, crear un lead →
      confirmar el DM. Repetir con No molestar activo (no debe llegar).

---

# Fase 7 — Hub de Acciones Rápidas + Suite de Tickets

Convierte Slack en superficie de operación: un hub de acciones filtradas por
permiso, la suite completa de tickets (bandeja, acciones por fila, aprobaciones,
un hilo vivo por ticket) y acciones operativas (turno extra, vacaciones, visita).

## Registro declarativo de acciones

`src/lib/integrations/slack/actions/registry.ts` — una acción es un `ModalDef`
(`build` + `submit` + gate `requires`) más `group`. El hub, `/opai <accion>` y los
shortcuts consumen el MISMO registro.

### Cómo agregar una acción (≈20 líneas)

```ts
// src/lib/integrations/slack/actions/mi-accion.ts
export const miAccionModal: ModalDef = {
  callbackId: "opai_mi_accion",
  title: "Mi acción",
  requires: (perms) => hasModuleAccess(perms, "ops"),   // gate de capability real
  build: async (ctx) => ({ /* Block Kit modal con callback_id opai_mi_accion */ }),
  submit: async (ctx) => {
    // valida ctx.state, llama al SERVICIO existente (no dupliques lógica),
    // return { ack: { response_action: "update", view: exito } };
  },
};
// registry.ts:  { ...miAccionModal, group: "Operaciones" }
```

Eso es todo: aparece en el hub (agrupada, solo si `requires` pasa), en `/opai
ayuda`, y se puede abrir por su callbackId.

## Hub (`opai_acciones`)

Shortcut global o `/opai acciones`: modal-menú con las acciones que el usuario
puede ejecutar (filtro por `requires(perms)`), agrupadas. Cada acción tiene un
botón "Abrir" (block_action `opai_action_open`) que apila su modal con `views.push`.

## Suite de tickets

- **Bandeja "Mis tickets"** (`/opai tickets`, `tickets/tray.ts`): filtros (estado,
  prioridad, SLA) + lista paginada (10/pág, ‹ ›). "Mis tickets" = asignados a mí O a
  un equipo del que soy miembro (`getAssignedTeamsForUser`, mismo criterio que la
  web). Cada fila: código enlazado a OPAI + badges + un select de acción.
- **Acciones por fila** (`tickets/row-*.ts`): Comentar · Cambiar estado · Cambiar
  prioridad · Reasignar · Cerrar · Cancelar → cada una apila un modal secundario
  (`views.push`) que ejecuta el **servicio compartido** (`tickets-transition.ts` /
  `tickets-mutations.ts`) y confirma en el modal. `/opai tickets vencidos` abre la
  bandeja pre-filtrada por SLA.
- **Bandeja de aprobaciones** (`/opai aprobaciones`, `tickets/approvals.ts`): tickets
  en `pending_approval` cuyo paso actual me toca (por usuario o grupo), con botones
  **Aprobar / Rechazar** inline → `decideTicketApproval` (mismo camino que Fase 2).
- **Eliminar: EXCLUIDO por diseño.** Operación irreversible = solo OPAI web. Desde
  Slack solo **Cerrar** (→ resolved) y **Cancelar** (→ cancelled, con confirmación).
  Ambos van por `transitionTicketStatus` (no hay endpoint de borrado).
- Toda mutación registra `recordTicketEvent` con `source: "slack"` + `logAudit`.

## Hilo por ticket (`TicketSlackThread`)

Migración `20261005000000_ticket_slack_thread` (aditiva). En `dispatch.ts`: cualquier
evento `ticket_*` con `data.ticketId` cae en el hilo de ese ticket. La tarjeta de
`ticket_created` establece la raíz (`slackTs`); los demás eventos (aprobación,
cambios, SLA, comentarios) se publican como **reply del hilo** (`thread_ts`). El
`thread_ts` viaja en el `payload` del outbox → sobrevive los reintentos del cron.
Resultado: la tarjeta del ticket en el canal ruteado es un tracker vivo con toda su
historia.

**Comentar desde el hilo** (`ticket-thread-comment.ts`): un reply humano en el hilo
raíz de un ticket → `addTicketComment` con el autor vinculado (patrón bridge-inbound,
se busca por `(canal, thread_ts)`). Ignora mensajes del bot; sin vínculo → efímero
para vincularse; con éxito, reacción ✅.

## Acciones operativas

- **Turno extra** (`actions/turno-extra.ts` + `turno-extra-create.ts` extraído de
  `/api/te`): instalación + guardia (por RUT/código) + fecha + tipo. Duplicados del
  servicio → `response_action: errors`.
- **Vacaciones** (`actions/vacaciones.ts`): NO hay módulo dedicado — es el tipo de
  ticket `solicitud_vacaciones` (aprobación RRHH). Reusa `createOpsTicket`.
- **Visita de supervisor** (`actions/visita.ts`): es un check-in GEO en vivo
  (lat/lng + geocerca). Slack no aporta GPS real, así que la acción es un **deep
  link** honesto a OPAI para marcar en terreno (no se fabrica geo falsa).

## Aislamiento (verificación escrita, Bloque 10)

- Tenant SIEMPRE por `getTenantForTeam(team_id)` → `getWorkspaceForTenant`; los
  servicios reciben `workspace.tenantId`, nunca un id del payload. `private_metadata`
  (ticketId, filtros) es contexto: el ticketId se re-valida en cada servicio, que
  filtra por tenant (`findFirst where tenantId`).
- Identidad SIEMPRE por `resolveLinkedAdmin`; el actor de toda mutación es el
  `adminId` vinculado. Permiso (`requires`) chequeado al abrir y re-validado al
  enviar (aprobaciones: `decideTicketApproval` valida su propio paso).

## Matriz de pruebas manuales (Fase 7)

| Caso | Esperado |
| --- | --- |
| `/opai acciones` (o shortcut) | Hub con solo las acciones permitidas, agrupadas |
| Usuario sin capability de un grupo | No ve ese grupo/acción en el hub |
| `/opai tickets` a 375px (Slack mobile) | Bandeja usable: filtros, filas, paginación, select de acción |
| Fila → Cancelar | Pide confirmación antes de cancelar (modal secundario) |
| Fila → Comentar / Estado / Prioridad / Reasignar | Modal secundario; al confirmar, servicio + auditoría |
| `/opai aprobaciones` → Aprobar | `decideTicketApproval`; la fila desaparece de la bandeja |
| Crear ticket → cambiar estado → aprobar | Todos los eventos caen en UN hilo en el canal ruteado |
| Responder el hilo de un ticket | Aparece como comentario en OPAI con el autor correcto |
| Responder el hilo sin vínculo | Efímero para vincular la cuenta |
| `/opai tickets vencidos` | Bandeja pre-filtrada por SLA vencido |
| Turno extra duplicado | Error de duplicado en el campo fecha |
| Vacaciones sin tipo configurado | Aviso "flujo no configurado" (no crea) |

## Checklist post-deploy (Fase 7)

- [ ] Migración `20261005000000_ticket_slack_thread` aplicada.
- [ ] Manifest: shortcut `Acciones rápidas OPAI` (`opai_acciones`). No requiere
      re-autorizar (shortcuts no son scopes).
- [ ] (Opcional) scope `reactions:write` para la reacción ✅ al comentar desde el
      hilo (si falta, el comentario igual se guarda; solo no reacciona).
- [ ] Prueba end-to-end de la matriz con un tenant conectado + un usuario vinculado.

## Backlog documentado (no implementado)

Reportar incidente con foto · Solicitar cobertura de turno · Permiso administrativo ·
Nuevo lead estructurado · Actividad CRM sobre cuenta · Aprobar descuento de cotización
· Bandeja aprobar rendiciones · Enviar documento a firma · Nota rápida de instalación.

## Limitaciones conocidas (Fase 7)

- La bandeja no se auto-refresca tras una acción por fila: el modal secundario muestra
  la confirmación; reabrir/re-filtrar la bandeja la actualiza. (Las aprobaciones SÍ
  se refrescan in-place por `views.update`.)
- Reasignar ofrece "asignarme a mí" o un equipo; candidatos persona-a-persona por
  membresía quedan como refinamiento.
- Los servicios de mutación (`tickets-transition`/`tickets-mutations`) son la vía de
  Slack; las rutas web monolíticas conservan su lógica (podrían adoptarlos luego).

---

# Fase 7.1 — Ruteo por categoría · Tarjetas ricas · Mis tickets · Reacciones · App Home · Agente nativo

Extiende la Fase 7 con seis capacidades, un commit por bloque (B1–B12, docs = B13).

## 1. Ruteo por CATEGORÍA (B1)

`SlackChannelRoute.matchType` sigue siendo `String`; se agrega el valor `CATEGORY`
(sin migración). Precedencia en `dispatch.ts` `resolveChannel`:
**KEY > CATEGORY > MODULE > default**. `matchValue` de una regla CATEGORY es el
`category` del catálogo (ej. `"CRM - Leads"`). En la UI de ruteo, cada header de
categoría gana su propio picker de canal + toggle; si algún evento de la categoría
tiene su regla KEY, se avisa (esa KEY prevalece). El API `routes` valida el enum
`["KEY","CATEGORY","MODULE"]`.

## 2. Tarjetas ricas (B2–B3)

`buildNotificationBlocks` pinta una sección `fields` (≤6 pares) — sobria, sin muros
de texto; `critical` conserva el 🚨. `toContextFields` deriva campos genéricos de
`data` (primitivos cortos; blacklist de `*Id`/`id`/`url*`/`token*`/`phone*`; labels
humanizadas). Enrichers por tipo:

- **Tickets**: `card-enrich.ts` carga lo mínimo por `ticketId` (prioridad, estado,
  responsable, instalación, hora de vencimiento SLA en horario de Chile). El campo
  **Responsable** menciona `<@U...>` si el asignado está vinculado (le llega).
- **Leads / postulaciones**: los emisores enriquecen su `data` en origen (empresa,
  contacto, comuna, origen, cargo, teléfono) — nunca queries duplicadas en dispatch.

## 3. Mis tickets (B4–B5)

- Tool `get_my_tickets` (args `estado`/`prioridad`/`solo_vencidos_sla`) filtra por la
  asignación real del usuario (`assignedTo` o sus equipos vía `getAssignedTeamsForUser`).
  `get_tickets_summary` se re-describe como resumen GLOBAL del sistema para desambiguar.
- Entrada **"Mis tickets"** en el grupo Tickets del hub, que reusa la bandeja existente
  (`opai_tickets`) vía `opai_action_open` → `getModal` (cero duplicación). `/opai ayuda`
  suma ejemplos (`/opai tickets`, `/opai tickets vencidos`).

## 4. Reacciones cruzadas (B6–B7)

Puente de reacciones sobre mensajes espejados (`SlackBridgeMessageMap`). Tabla
`emoji.ts` convierte nombre-Slack ↔ unicode (~45 comunes; tonos de piel y variation
selectors normalizados al base); los desconocidos se omiten con log.

- **Slack→OPAI** (`reactions.ts`): `reaction_added/removed` sobre un mensaje puenteado →
  filtro barato (mapa + no-bot) → admin vinculado → upsert/delete `ChatMessageReaction`
  con su identidad real + evento Pusher idéntico al de la UI. No vinculados se omiten (v1).
- **OPAI→Slack**: hook `after()` en la ruta de reacciones del chat admin → el **BOT**
  pone/quita la reacción en Slack.
- **Asimetría documentada**: hacia Slack todas salen del bot (Slack no permite
  reaccionar a nombre de terceros); hacia OPAI llegan con el admin real. Anti-loop:
  `event.user === botUserId` se ignora al entrar.

## 5. App Home + bienvenida (B8)

La pestaña **Inicio** (`views.publish`, `app_home_opened`) es el panel personal:
contadores propios (tickets abiertos/vencidos vía `listMyTickets`) y botones grandes
que reusan `opai_action_open` (Mis tickets · Vencidos SLA · Aprobaciones · Nuevo ticket
· Nueva rendición · Todas las acciones). Sin vínculo → Home minimalista con CTA. Como
desde el Home/DM no hay modal en pila, `pushActionModal` **abre** (no apila). El Home se
refresca tras aprobar/confirmar. Mensaje de bienvenida único por DM en la pestaña
Mensajes, marcado con `SlackUserLink.welcomedAt` (migración aditiva) para no repetirlo.

## 6. Gestión del ticket desde su tarjeta (B9)

Las tarjetas de eventos `ticket_*` (salvo la de aprobación) ganan una fila de acciones:
**Comentar · Estado · Aplazar SLA · Pausar/Reanudar SLA · Silenciar** (`action_id: tcard`).
Cada botón abre el modal por-fila (`views.open` desde el canal) que ejecuta servicios
reales. `tickets-sla.ts` (`extendSla`, `togglePauseSla`, `snoozeSla`) espeja la lógica
del PATCH web con identidad real + `recordTicketEvent`. Los mismos controles se suman a
la bandeja por-fila.

## 7. Links profundos y tarjetas de entidades del bot (B10)

`get_my_tickets` y `get_tickets_summary` ahora devuelven `id` + `url` por ticket. El
runner del help-chat recolecta hasta 3 entidades con `url` de los resultados de tools;
el bot de Slack las adjunta como tarjetas compactas (título · subtítulo · botón Abrir)
que llevan a **LA** entidad. Regla dura en el system prompt v2: los links SIEMPRE salen
del campo `url` de las tools; prohibido adivinar rutas. (El runner ya absolutiza los
links del texto.)

## 8. Menciones cruzadas en comentarios (B11)

- **Slack→OPAI** (`ticket-thread-comment.ts`): un reply que menciona `<@U...>` resuelve
  el admin vinculado, lo escribe como `@Nombre` en el comentario de OPAI y le notifica
  (`ticket_mention`, con `data.skipSlack` para no re-postear en su propio hilo — ya pingó
  nativo en Slack).
- **OPAI→Slack**: el emisor de comentarios adjunta `data.mentions` (nombre→adminId) y
  `dispatch` convierte `@Nombre` a `<@U...>` en el hilo cuando el mencionado está
  vinculado (best-effort; no vinculados quedan en texto plano).

## 9. Agente nativo (agent_view) (B12)

`assistant_thread_started` → saludo breve + `assistant.threads.setSuggestedPrompts`
(Mis tickets por prioridad · caja del mes · vencidos SLA · crear lead). Los suggested
prompts cumplen el rol del mensaje de bienvenida en la superficie de agente.
`assistant_thread_context_changed` → guarda el canal activo (`SlackUserLink.activeChannelId`,
migración aditiva); si es un canal puenteado, el bot pasa un `contextHint` al runner para
responder situado. En el turno del bot: `setStatus("Pensando…")` + `setTitle` nativos
(best-effort; en un DM normal fallan y se ignoran).

## Matriz de pruebas manuales (Fase 7.1)

| Caso | Esperado |
| --- | --- |
| Rutear categoría "CRM - Leads" a #canal | Todos los eventos de la categoría van a ese canal |
| Regla KEY sobre un evento de esa categoría | La KEY prevalece; el header avisa "N con regla propia" |
| Tarjeta del próximo SLA vencido | Muestra prioridad, responsable, instalación y hora de vencimiento |
| Responsable vinculado a Slack | La tarjeta lo menciona `<@U...>` (le llega) |
| "¿qué tickets tengo?" al bot | Devuelve SOLO los del usuario (get_my_tickets), no del sistema |
| "Mis tickets" en el hub | Abre la bandeja existente |
| 👍 en OPAI sobre mensaje puenteado | Aparece en Slack (del bot) |
| ✅ en Slack sobre mensaje puenteado | Aparece en OPAI con el nombre del admin vinculado |
| Abrir pestaña Inicio | Panel con contadores propios + botones (sin manual) |
| Botón "Aplazar SLA" en la tarjeta | Modal con datepicker + motivo; aplica `extendSla` |
| Botón "Pausar SLA" | Pausa o reanuda según el estado; extiende el plazo al reanudar |
| "¿qué cotización le mandé a X?" | Tarjeta con botón que abre LA cotización, no la lista |
| Reply con `<@U>` en el hilo del ticket | Comentario en OPAI con @Nombre + notifica al mencionado |
| Abrir el agente OPAI (panel de IA) | Saludo + 3-4 prompts sugeridos |

## Checklist post-deploy (Fase 7.1)

- [ ] **Manifest** (paso manual, requiere **re-autorizar** por los scopes nuevos):
      bot scopes `reactions:read` + `reactions:write`; bot events `reaction_added`,
      `reaction_removed`, `app_home_opened`, `assistant_thread_started`,
      `assistant_thread_context_changed`; `features.app_home.home_tab_enabled: true`;
      `features.assistant_view` habilitado.
- [ ] Migración `20261006000000_slack_user_link_welcomed` aplicada.
- [ ] Migración `20261007000000_slack_user_link_active_channel` aplicada.
- [ ] Prueba end-to-end de la matriz con un tenant conectado + un usuario vinculado.

## Limitaciones conocidas (Fase 7.1)

- Reacciones OPAI→Slack sólo desde el chat **admin** (los portales aún no tienen ruta de
  reacciones). Sólo se espejan los ~45 emojis de la tabla; el resto se omite.
- La conversión de menciones OPAI→Slack es best-effort sobre nombre/primer-nombre (OPAI
  guarda las menciones como texto `@Nombre`, no como token de id).
- `tickets-sla.ts` espeja la lógica SLA del PATCH web para uso desde Slack; la ruta web
  conserva su lógica inline (podría adoptar el servicio luego).
- El `contextHint` del panel de IA es una pista textual del canal activo; no resuelve aún
  la instalación específica.

# Fase 11 — Alcances de bandeja · Home desglosado · Tomar · Botones robustos

## 1. Todos los botones del Home/hub abren su modal (B1)

Causa raíz corregida: `pushActionModal` corría el `build` del modal (que puede lanzar
queries pesadas — la **bandeja de aprobaciones** es la más lenta) **antes** de `views.open`,
y el `trigger_id` perecedero (~3s) expiraba. El botón "Pendientes de mi aprobación" parecía
"no hacer nada".

Ahora `pushActionModal` **consume el trigger_id primero** con un modal de carga (`views.open`
desde el App Home / DM, `views.push` desde el hub) y el `build` real hace `views.update`
sobre ese view — mismo patrón que `openModalForShortcut`. Aplica a los **6 botones** del Home
y a todos los botones "Abrir" del hub.

Matriz Home → modal (los 6 abren):

| Botón | `value` (callbackId) | Modal |
|---|---|---|
| 🎫 Mis tickets | `opai_tickets` | bandeja |
| 🔴 Vencidos SLA | `opai_tickets_vencidos` | bandeja (SLA vencido) |
| ✅ Pendientes de mi aprobación | `opai_aprobaciones` | aprobaciones |
| ➕ Nuevo ticket | `opai_crear_ticket` | crear ticket |
| 🧾 Nueva rendición | `opai_nueva_rendicion` | rendición |
| ⚡ Todas las acciones | `opai_acciones` | hub |

## 2. Alcances de la bandeja, espejo de la web (B2)

La bandeja replica la taxonomía de alcance de `/ops/tickets`. Chips (botones) en la parte
superior del modal:

- **Míos** (`mine`) — asignados a mí.
- **Mi equipo** (`my_team`, default) — a mí **o** a un equipo del que soy miembro
  (`getAssignedTeamsForUser`). Sin equipos degrada a "Míos".
- **Sin asignar** (`unassigned`) — sin responsable, a nivel **tenant**.
- **Todos** (`all`) — todos los del tenant.

Los dos tenant-wide (**Sin asignar**, **Todos**) solo se muestran si el usuario tiene
**visión global**. Auditoría: el único gate de la vista "Todos" de la web es
`ensureOpsAccess` → `hasModuleAccess(perms, "ops")`; **no existe** una capability aparte.
Por eso en Slack se usa el mismo criterio (`canViewAllTickets`). El título del modal refleja
el alcance activo ("Tickets · Mi equipo", "Tickets · Sin asignar", …). El alcance viaja en
`private_metadata.scope` y es combinable con los filtros de estado/prioridad/SLA. Defensa:
un alcance tenant-wide sin visión global degrada a `my_team` (en el `build` y en el dispatch).

## 3. Home "Tu día" desglosado (B2)

`publishHome` calcula, con `countTickets`:

- `Asignados a ti: N` (scope `mine`)
- `Tu equipo: N` (scope `my_team`)
- `Sin asignar (tenant): N` (scope `unassigned`) — **solo** si el usuario tiene visión global.
- `🔴 N con SLA vencido` (scope `my_team` + `slaBreached`).

Los botones "Mis tickets" / "Vencidos" abren la bandeja en su alcance correspondiente
(default `my_team`).

## 4. Botón "Tomar" de un clic (B2)

Por fila, cuando el ticket está **sin responsable** y pertenece a un **equipo del usuario**,
se muestra un botón `🙋 Tomar`. Un clic → `claimTicket` (en `tickets-mutations.ts`):

- **Anti-carrera**: el update es condicional (`updateMany where assignedTo:null`); si otro lo
  tomó primero devuelve `raced`. La bandeja se **refresca con aviso** (context block).
- Respeta el guard de terminales (no se toma un ticket resuelto/cancelado).
- Registra `recordTicketEvent(assignee_changed, from:null→actor)`. No notifica (uno se asigna
  a sí mismo).

## Matriz de pruebas manuales (Fase 11)

- [ ] Botón "Pendientes de mi aprobación" **abre** el modal (con y sin pendientes).
- [ ] Los 6 botones del Home abren su modal; los "Abrir" del hub también.
- [ ] Chips de alcance calzan 1:1 con los conteos de la web para el mismo usuario.
- [ ] "Sin asignar" y "Todos" solo aparecen para usuarios con acceso al módulo ops.
- [ ] "Tomar" asigna el ticket; un segundo "Tomar" ajeno avisa "Otro usuario lo tomó primero".
- [ ] Home muestra "Asignados a ti · Tu equipo · Sin asignar (tenant)" y cada número cuadra.

# Fase 13 — Aprobaciones unificadas (rendiciones + turnos extra)

El aprobador no piensa en módulos: piensa en "¿qué espera mi firma?". La bandeja
**Pendientes de tu aprobación** se vuelve multi-dominio — 🎫 Tickets · 🧾 Rendiciones ·
⏱ Turnos extra — con Aprobar/Rechazar inline en las tres, desde el teléfono.

## Servicios reutilizables (B1)

Aprobar/rechazar se **extrajo** del inline de los routes web a servicios compartidos que
consumen tanto la web como Slack (cero duplicación):

- `src/lib/rendiciones-approvals.ts` — `listRendicionesPendingApproval`, `countRendicionesPendingApproval`,
  `approveRendicion`, `rejectRendicion`. Solo `SUBMITTED` es accionable; transición anti-carrera
  (`updateMany where status=SUBMITTED`); escribe `FinanceRendicionHistory`, `logAudit` y notifica
  al solicitante. Aprobador = fila `FinanceApproval` (decision null) asignada al admin.
- `src/lib/te-approvals.ts` — `listPendingTes`, `countPendingTes`, `approveTe`, `rejectTe`. Estado
  `pending|approved|rejected|paid`; anti-carrera con guard de estado; audita `te.approved`/`te.rejected`
  y notifica a quien lo ingresó (`createdBy`). No hay aprobador asignado: "pendiente para mí" = todos
  los `pending` del tenant SI tengo capability `te_approve`.

Control de acceso = del **caller** (patrón `rendiciones-create.ts`): el route web mantiene su gate;
cada handler de Slack exige la capability real (`rendicion_approve` / `te_approve`) ANTES de decidir.

## Eventos del catálogo (B2)

`rendicion_submitted` / `rendicion_approved` / `rendicion_rejected` (cat. **Finanzas - Rendiciones**),
`te_created` / `te_approved` / `te_rejected` (cat. **Operaciones - Turnos**). Se reutilizan las
categorías existentes → el ruteo por categoría (F7.1) los agrupa sin tocar el dispatcher. Emisores:
el submit de rendición (`rendicion_submitted` → aprobadores asignados), el create de TE
(`te_created` → difusión a admins con visión de turnos extra), y los servicios de decisión
(`*_approved`/`*_rejected` → solicitante). `data` rica (monto CLP, solicitante/guardia, instalación,
fecha, motivo) para la tarjeta genérica.

## Bandeja unificada (B3)

`/opai aprobaciones` (y el botón del Home) abren `inboxModal` (`opai_aprobaciones`), ahora
multi-dominio (`src/lib/integrations/slack/approvals/inbox.ts` + `inbox-actions.ts`):

- Secciones por dominio, **solo** las que el usuario puede aprobar y con pendientes.
- Fila densa: `REN-XX · $45.000 · Juan Pérez · Combustible` / `TE · $28.000 · Guardia X · Polpaico · 05-07`.
- **Aprobar** inline (`apx_approve`, anti-carrera del servicio); **Rechazar** (`apx_reject`) →
  `views.push` del modal de motivo **obligatorio** (`apx_reason`, compartido con las tarjetas).
- Paginación por sección (`apx_page`, 6/pág), estado en `private_metadata.page` (`t-r-e`).
- El **contador del Home** ("Pendientes de tu aprobación: N") es el AGREGADO de los tres dominios
  (`countInbox` = tickets + rendiciones + TEs, cada uno gateado por su capability).

## Mis rendiciones — lado solicitante (B4)

`/opai rendiciones`, botón "🧾 Mis rendiciones" del Home y tile del hub (grupo Finanzas) abren
`misRendicionesModal` (`opai_mis_rendiciones`): las rendiciones del usuario (`submitterId`), filtro
por estado (`misren_filter`), fila `código · monto · estado · fecha` con "Ver en OPAI" y 📎 Boleta si
existe, y "➕ Nueva rendición" que reusa el modal F5 (`opai_nueva_rendicion`).

## Tarjetas accionables (B5)

Las tarjetas de `rendicion_submitted` y `te_created` llevan **Aprobar / Rechazar** directos
(`apcard_approve` / `apcard_reject`, action_id único por bloque, `value = domain:pendingId`), gateados
por capability real al presionar. El dispatch crea una `SlackPendingAction`
(`RENDICION_APPROVAL` / `TE_APPROVAL`) y ancla el `messageTs` para actualizar la tarjeta. Aprobar
reclama atómicamente (`claimPending`) → `chat.update`: "✅ Aprobada por @X a las HH:MM". Rechazar abre
el modal de motivo (origin=card) que al enviar rechaza y actualiza la misma tarjeta. Doble decisión →
la tarjeta informa el estado real.

## Matriz de pruebas manuales (Fase 13)

- [ ] Rendición creada desde Slack → aprobador recibe tarjeta con botones Y la ve en su bandeja.
- [ ] Aprobar (bandeja o tarjeta) → solicitante notificado, `FinanceRendicionHistory` registrado.
- [ ] Rechazo exige motivo (≥3) y el motivo viaja al solicitante.
- [ ] TE ingresado (web o Slack) → tarjeta al aprobador → aprobar setea `approvedBy`/`approvedAt`.
- [ ] Usuario sin capability no ve la sección ni puede forzar por API (el servicio manda).
- [ ] Contador del Home = suma real de los tres dominios.
- [ ] Carrera de dos aprobadores → el segundo recibe aviso limpio ("ya fue resuelto").
- [ ] 375px usable (filas densas de una línea + botones).

---

# Fase 14 — Aplazar operativo · comentarios reales · hilo = feed · recordatorios sin spam

## Títulos de modal seguros (B1)

Slack RECHAZA `views.open/push/update` con `invalid_arguments` (sin detalle) si el
`title.text` supera **24 chars**. `pt()` cortaba a 75 → "Aplazar SLA TK-12345" o
"Pendientes de mi aprobación" (27) reventaban el modal en silencio: "el botón no hacía
nada". Confirmado en runtime logs de Vercel.

- `modals/title.ts`: `clampModalTitle` (≤24, corte con "…"), `modalTitle`, `clampViewTitle`.
- Red de seguridad en el **choke-point** de la API (`slackOpenView/UpdateView/PushView`
  vía `callViewMethod`) y en el ACK `response_action` de la ruta de interactividad → cubre
  TODOS los builders, incluidas las vistas devueltas por HTTP que no pasan por `api.ts`.
- Al recibir `invalid_arguments` se **loguea el título ofensor** (`title="…"`): la clase de
  bug deja de ser muda. Builders con títulos dinámicos (row-views, tray) usan `modalTitle`.

## El comentario de Slack ES un comentario del ticket (B2)

El submit de comentar (tarjeta y bandeja) ya creaba el mismo `OpsTicketComment` que la web
(mismo modelo/autor que renderiza el timeline). Se agrega el **autor real** en la
confirmación ("Comentario agregado a TK-X por *Nombre*"). La provenance `slack` vive en el
`logAudit` (`via: slack_tray`); no se agrega columna `source` para conservar paridad exacta
con un comentario web.

## El hilo = feed de actividad completo (B3)

- **Root en el primer contacto** (`dispatch.ts`): la raíz del hilo (`TicketSlackThread`) se
  ancla con el PRIMER mensaje de un ticket sin hilo previo, **sea cual sea el evento** (antes
  solo `ticket_created`). El `unique(ticketId)` + catch absorbe la carrera. Efecto: un ticket
  anterior a F7.1 funda su hilo con el próximo recordatorio y todos los siguientes encadenan.
- **Comentarios al hilo** (`ticket-thread-mirror.ts`): cada comentario cae como reply
  (`💬 autor: texto`; nombre/avatar nativo vía `chat:write.customize` si el autor está
  vinculado). Aplica a comentarios desde Slack (tarjeta/bandeja, vía `work` en `after()`) y
  desde la web (route POST `/comments`, vía `after()`). La tarjeta de notificación de
  comentario deja de duplicar (`skipSlack`) porque el espejo limpio la reemplaza.
- **Cambios de estado/decisiones** caen solos como reply gracias al root: ya se rutean por
  `notify` con `key` `ticket_*` y `threadTs` del hilo.

## Recordatorios configurables por tenant (B4)

Ver **docs/tickets/sla.md**. Intervalos por prioridad, tope diario por ticket y "solo resumen
diario" viven en **Configuración → Notificaciones → Recordatorios de SLA** (Setting
`notification_preferences.slaReminderPolicy`, sin migración; `src/lib/tickets-sla-policy.ts`).
El monitor los lee por tenant, cuenta los recordatorios del día por ticket (dedupKey
`sla_reminder*`) para el tope, y respeta el botón **Silenciar** (`snoozedUntil`).

## Matriz de pruebas manuales (Fase 14)

- [ ] Los 5 botones de la tarjeta abren y ejecutan (comentar · estado · aplazar · pausar · silenciar).
- [ ] "Pendientes de mi aprobación" (título largo) abre sin `invalid_arguments`.
- [ ] Comentar desde Slack → el comentario aparece en el timeline de OPAI con el autor correcto.
- [ ] Comentar desde la web → aparece en el hilo de Slack (`💬 autor: texto`), sin tarjeta duplicada.
- [ ] Segundo recordatorio de un ticket anterior a F7.1 → encadena bajo el primero (funda el hilo).
- [ ] Ticket silenciado (Silenciar 1h) → el monitor no recuerda mientras dure.
- [ ] Tope diario (3) → el 4º recordatorio del día no se envía.
- [ ] Cambiar intervalo P1 a 4h en config → el monitor deja de recordar antes de las 4h.
- [ ] Prioridad en "solo resumen diario" → sin campanas, solo en el digest.
- [ ] 375px usable (sección de recordatorios: fila prioridad + input + toggle).

---

# Fase 15 — Cockpit comercial: del lead a la cotización en minutos

Slack se vuelve el cockpit del vendedor: el lead llega con botones, la cotización
sale en un clic, el sistema avisa cuando el cliente está mirando, y ningún negocio
muere por olvido. Todo gateado por capability **crm**. Ver el playbook de negocio
en `docs/crm/velocidad-comercial.md`.

## Decisiones de arquitectura

- **Dispatch genérico + ramas por-key.** Las tarjetas siguen armándose con
  `buildNotificationBlocks`; para `new_lead` y `quote_viewed` se agregó una rama en
  `dispatch.ts` (espejo de `ticket_*`) que añade la fila de acciones.
- **WhatsApp = botón URL `wa.me`** (un toque, ideal iPhone; mensaje resuelto por
  `getWaTemplate` + entidades). Slack no llama de vuelta en botones URL → el clic no
  se loguea; la provenance queda en la acción trackeada acompañante.
- **Motores reusados por extracción mecánica** (cero cambios de comportamiento):
  `src/lib/crm-lead-quote-engine.ts` (creación lead→cotización, vive en el **PR #568**,
  no en main) y `src/lib/crm/change-deal-stage.ts` (cambio de etapa). Los routes
  `approve` y `deals/[id]/stage` quedaron como wrappers delgados.

## B1 — Tarjeta-cockpit del lead + `/opai leads`

- La tarjeta de `new_lead` gana: 👤 Tomar · 🟢 WhatsApp · ✉️ Cotizar · 📝 Convertir en
  OPAI · 📅 Recordar 2h · ❌ Descartar (`src/lib/integrations/slack/comercial/lead-card.ts`).
- **Tomar** estampa `firstContactAt`/`firstContactBy` de forma atómica → corta el
  escalamiento (el cron `lead-escalation` filtra `firstContactAt: null`). Cero campos nuevos.
- **Recordar 2h** estrena `CrmTask`; **Descartar** espeja el reject web (status +
  metadata.rejection + `CrmHistoryLog`).
- `/opai leads` (+ `nuevos` = sin tomar): filtros estado/origen/sin-tomar, paginado 10,
  "sin tomar" primero y destacado (`comercial/leads-tray.ts`, `leads-list.ts`).

## B2 — Cotización desde el lead en dos velocidades (PR #568)

- **Exprés**: lead con dotación estructurada → modal de revisión (resumen + instalación/
  comuna) → `approveLeadToEntities` (mismo motor y precio que la web, usa la dotación real)
  → tarjeta por DM: `CPQ-XXX · $X/mes · [Ver PDF][Enviar al cliente][Editar en OPAI]`.
- **Fallback/Cockpit**: lead sin datos → deep-link `📝 Convertir en OPAI` (`/crm/leads/{id}`).
- **Enviar** usa `sendQuoteToPortal` (canónico, 1×) y dispara `quote_sent`.
- **Bonus**: al crear un lead se dispara `enrichLeadFromWebsite` (after(), toggle
  Setting `crm.leadAutoEnrich`) para que la tarjeta llegue enriquecida.

## B3 — 🔥 El momento caliente (`quote_viewed`)

- El evento existía en el catálogo pero **sin emisor**: ahora el beacon del portal
  (`cotizaciones/[id]/view`) llama `emitQuoteViewed` (throttle 30 min por cotización).
- Tarjeta: "🔥 {Contacto} de {Empresa} está viendo {código} AHORA (vista #N)" + monto +
  vigencia + línea 📞 Llamar + botones 🟢 WhatsApp ("¿te llamo?") · ⏰ Recordar 1h.
- El owner recibe la alerta en el **canal compartido** (ruteo CPQ/default). El DM
  personal solo aplica si **no** hay destino en canal (sin duplicar).

## B4 — Pipeline vivo (`/opai pipeline`) + `/opai cotizaciones`

- Overview por etapa (N negocios · Σ CLP) → drill → deals (cliente · monto · días en
  etapa · última actividad) con overflow: ⏩ Avanzar · 📝 Nota · 🎉 Ganado · 💔 Perdido,
  + 🟢 WhatsApp por deal (`comercial/pipeline.ts`).
- **Ganado/Perdido** usan `changeDealStage` (servicio real → `CrmDealStageHistory`).
  Al ganar se emite el nuevo evento **`deal_won`** (🎉 al canal comercial).
- `/opai cotizaciones [estado]`: bandeja de quotes con filtro + 🟢 WhatsApp por fila.

## B5 — El loop anti-olvido (48h)

- El motor de follow-up por email (`CrmFollowUpConfig` + `processFollowUpLog`, cron
  `followup-emails`) sigue activo; se le agrega una salida Slack:
- Cron **`crm-quote-followup`** (hourly): cotización `sent` sin vista/aceptación/rechazo y
  `updatedAt > 48h` → tarjeta a comercial: "⏳ {Cliente} lleva 48h sin responder {código}"
  + 🟢 WhatsApp · ✉️ Reenviar · ⏰ Posponer 24h · 💔 Marcar perdida.
- Auto-documentado y sin spam: cada acción escribe `CrmHistoryLog` (`quote_stale_*`); el
  sweep respeta posposiciones (`comercial/quote-stale.ts`).

## B6 — Digest comercial + Home

- Cron **`comercial-digest`** (~08:00 Chile): lunes a todos los tenants con Slack; a diario
  a los que activen Setting `crm.digestDaily`. Idempotente por (tenant, día) vía outbox.
- "📊 Semana comercial: pipeline $X en N negocios · M cotizaciones enviadas (time-to-quote
  prom: Xh) · K vistas sin respuesta · J leads sin tomar · negocios sin actividad >7d".
- Home de OPAI: sección **Comercial** (gate crm) con contadores (leads sin tomar ·
  cotizaciones por vencer · 🔥 viendo ahora) + botones a las bandejas.

## B8 — Presencia total + `slack_channel_context`

- Botón "Unirse a todos los canales públicos" en el panel Slack → `POST
  /api/integrations/slack/join-all` (itera `conversations.list` + `conversations.join`,
  pausa cada 20 si >50; reporta "unido a N, ya estaba en M"). Privados = `/invite @OPAI`.
- Evento `channel_created` → auto-join en `after()`.
- Tool del bot **`slack_channel_context({channel})`**: lee las últimas ~50 vía
  `conversations.history` (solo si el bot es miembro; si no, respuesta accionable) y las
  entrega al runner. **Sin persistencia** (privacidad v1; ingesta permanente fuera de
  alcance). Registrada en el system prompt (`comercial`/`presence.ts`).
- **Paso manual (Carlos)**: agregar scope `channels:join` + bot_event `channel_created`
  al manifest y **Re-autorizar**.

## Matriz de pruebas manuales (Fase 15)

> No ejecutable en la sesión de Claude (MCP Slack sin autorizar). Checklist para Carlos.

- [ ] Lead nuevo → la tarjeta llega con los 6 botones; **Tomar** corta el escalamiento
      (el lead ya no reaparece en `lead-escalation`).
- [ ] **Cotizar** exprés sobre un lead del cotizador → genera la MISMA cotización que la web
      (precio idéntico); **Enviar** dispara `quote_sent` y el cliente la recibe.
- [ ] Lead sin datos estructurados → **Cotizar** cae al deep-link "Convertir en OPAI".
- [ ] Abrir la cotización como cliente en el portal → tarjeta 🔥 con teléfono correcto;
      refrescar no re-alerta (throttle 30 min).
- [ ] `/opai pipeline` → overview con montos; drill; **Avanzar** queda en `CrmDealStageHistory`;
      **Ganado** → 🎉 al canal; **Perdido** guarda motivo.
- [ ] `/opai cotizaciones enviadas` → lista filtrada con WhatsApp por fila.
- [ ] 48h sin respuesta → tarjeta de seguimiento; **Reenviar/Posponer/Perdida** funcionan y
      no re-avisan lo ya avisado; ver/responder la cotización la saca del sweep.
- [ ] Lunes 08:00 → digest al canal comercial con las métricas.
- [ ] Home de OPAI (usuario crm) → sección Comercial con contadores y botones.
- [ ] `wa.me` abre WhatsApp con el mensaje correcto (probar iPhone).
- [ ] Botón "Unirse a todos los canales públicos" → se une sin rate-limit; canal nuevo →
      OPAI aparece solo; "resume #canal" responde con lo último; canal privado sin invitación
      → mensaje accionable.
- [ ] Títulos de modal ≤24; capability **crm** gatea comandos, cards y Home.

## Deal Rooms (Fase 16)

Cada negocio importante gana su canal de Slack ligado al `CrmDeal`. Detalle
completo en [`docs/crm/deal-rooms.md`](../crm/deal-rooms.md). Resumen de piezas:

- **Modelo** `CrmDealSlackRoom` (`deal_id` único, ficha fijada, `OPEN|ARCHIVED`).
- **Servicio** `openDealRoom` / `maybeAutoOpenDealRoom` (umbral por tenant en
  `Setting`, **default OFF**).
- **Ficha viva** fijada, re-editada con `chat.update` en cada evento del negocio.
- **Ruteo**: `dispatch` manda a la sala (en vez del canal de categoría) todo
  evento con `dealId` y sala OPEN; nuevos eventos `deal_stage_changed` / `deal_lost`.
- **Guardar en OPAI** (shortcut `opai_guardar`): `CrmNote` con autor + permalink;
  adjuntos a R2; buscador de entidad (`external_select` + `block_suggestion`).
- **Channel Expert**: doble contexto (conversación + ficha) inyectado al runner.
- **Ciclo de vida**: won → 🎉 + resumen + Archivar/Handoff; lost → post-mortem.
- **Gobernanza**: canales excluidos (`Setting` `slack_governance`), respetados por
  el B8 y el Channel Expert.

### Paso manual PREVIO (Carlos, en el Slack dashboard)

Agregar scopes del bot `channels:manage`, `groups:write`, `pins:write` (`files:read`
ya está). Agregar el message shortcut **"Guardar en OPAI"** (`callback_id`
`opai_guardar`). Guardar → **Re-autorizar**.

## Matriz de pruebas manuales (Fase 16 — Deal Rooms)

> No ejecutable en la sesión de Claude (MCP Slack sin autorizar). Checklist para Carlos.

- [ ] Negocio cruza a Negociación → **Abrir sala del negocio** (web o `/opai pipeline`)
      → se crea `neg-{cliente}` privado, invita al creador+owner, ficha viva fijada.
- [ ] Cotización nueva del CPQ del MISMO deal → cae SOLA a la sala; al abrirla el
      cliente, el 🔥 (`quote_viewed`) cae ahí mismo y la ficha se actualiza.
- [ ] Avanzar etapa (ficha o pipeline) → la ficha fijada refleja la etapa nueva.
- [ ] "Guardar en OPAI" desde un mensaje de la sala → nota en el negocio, visible
      en el detalle web (pestaña **Notas**) con autor y link al mensaje; ✅ en el hilo.
- [ ] "Guardar en OPAI" desde un canal normal → buscador cuenta/negocio/lead → nota
      guardada en la entidad elegida; adjunto del mensaje aparece linkeado (R2).
- [ ] `@OPAI ¿en qué quedamos?` dentro de la sala → responde mezclando la
      conversación de la sala y los datos del CRM (monto/etapa/cotización).
- [ ] Negocio **ganado** → 🎉 + resumen en la sala; **Convertir en canal de
      operación** renombra a `op-{cliente}` y ofrece el link a la operación;
      **Archivar** archiva (map conservado).
- [ ] Negocio **perdido** → mini post-mortem del bot + **Archivar**.
- [ ] Canal en la lista de exclusión → `resume #canal` / Channel Expert **declinan**
      leerlo con aviso claro.
- [ ] Títulos de modal ≤24; capability **crm** (edit) gatea abrir sala, guardar nota
      y las acciones de la ficha.

---

# Fase 17 — Pulido del cockpit comercial

Cuatro bloques de pulido sobre F15/F16.

## B1 — Efímeros de progreso: mutan o desaparecen (cero huérfanos)

Regla OBLIGATORIA de toda la integración: **`chat.delete` NO borra efímeros** —
solo su `response_url` puede REEMPLAZARLOS (`replace_original`) o ELIMINARLOS
(`delete_original`, ventana 30 min). Todo efímero de progreso termina reemplazado
o eliminado; prohibido dejar huérfanos.

- **Slash `/opai`**: el route ACK-ea con `⏳ Procesando tu consulta…` (efímero).
  - Camino de **MODAL** (`tickets`/`rendicion`/`leads`/`cotizaciones`…):
    `openModalByCallback` abre el modal (el modal ES el feedback) y devuelve si lo
    logró; el comando ELIMINA el `⏳` vía `delete_original`. Si el modal no abrió
    (trigger vencido), el `⏳` MUTA a un aviso vía `replace_original`. Ya no queda
    el viejo `📂 Abriendo…` huérfano.
  - Camino de **TEXTO** (pregunta libre / subcomando prompt): la respuesta final
    va al MISMO `response_url` con `replace_original` → un solo bubble que muta.
- **`block_actions`** (leads/cotizaciones/aprobaciones/deal-room): la ruta de
  interactividad ACK-ea `{ok:true}` (sin efímero de progreso). Los avisos son
  efímeros TERMINALES (resultado), no spinners; NO se usa `replace_original` sobre
  ellos porque editarían la **tarjeta compartida** del canal.
- `slackRespondUrl` acepta `delete_original` (además de `replace_original`).

## B2/B3 — Drill del pipeline (`/opai pipeline`)

Ver el docstring de `comercial/pipeline.ts`. Resumen:

- Fila: `🏠 *Cuenta* · negocio · monto` (badge 🏠 si el negocio tiene sala OPEN) +
  `⏱ {semáforo} {días}d en etapa · act {fecha}`.
- **Días en etapa** siempre calculados: último cambio en `CrmDealStageHistory`
  con **fallback a `createdAt`** para negocios pre-tracking (nunca "—").
- **Semáforo de frío**: filas ordenadas del más frío (más días) al más fresco; ⏱
  coloreado 🟢 <7d · 🟠 7-14d · 🔴 >14d.
- **Botones por fila**: `🔗 Abrir en OPAI` (`/crm/deals/{id}`, `getCanonicalSiteUrl`)
  · `🏠 Ir a la sala` (deep-link `app.slack.com/client/{team}/{channel}`) o
  `🏠 Abrir sala` (reusa `openDealRoom`, requiere edit) · `🟢 WhatsApp`.
- **Overflow por fila** (≤5, límite de Slack): `📞 Llamar` (tel) + Avanzar / Nota /
  Ganado / Perdido (solo con capability crm-edit).
- **Navegación** `← Pipeline`: del drill al overview vía `views.update`.
- **Límite documentado**: `🟢 WhatsApp` y `📞 Llamar` son botones URL — Slack NO
  notifica los clics de botones URL, así que el contacto no se registra solo; el
  registro queda vía `📝 Nota` manual o el followup-log de otras acciones.

## Matriz de pruebas manuales (Fase 17)

> No ejecutable en la sesión de Claude (MCP Slack sin autorizar). Checklist para Carlos.

- [ ] `/opai pipeline` → abrir una etapa → cerrar el modal → **el canal queda sin
      residuos** (sin `⏳`/`📂` pegados; sin recargar Slack).
- [ ] `/opai [pregunta libre]` → **un solo** efímero que muta de `⏳ Procesando…`
      a la respuesta final (nunca dos bubbles).
- [ ] Fila del drill muestra **cuenta + negocio + monto + ⏱ coloreado**; el orden
      va del más frío (🔴) al más fresco (🟢).
- [ ] `🔗 Abrir en OPAI` aterriza en `/crm/deals/{id}` correcto.
- [ ] Negocio **con sala OPEN**: badge 🏠 en la fila y `🏠 Ir a la sala` abre el
      canal; negocio **sin sala** (usuario con edit): `🏠 Abrir sala` la crea.
- [ ] Negocio **sin historial de etapa** (pre-tracking): muestra días desde
      `createdAt`, nunca "—" (caso Zelestra).
- [ ] `← Pipeline` vuelve al overview sin cerrar el modal.
- [ ] Legible a **375px**; títulos de modal ≤24; overflow ≤5 opciones.

# Fase 20 — Pulido visual: Home sin redundancia · hub semántico · defaults inteligentes

## Principios visuales del Home/hub (regla para TODA acción futura)

1. **El contador ES el botón.** Un número que importa se toca: `🎫 6 abiertos`
   abre la bandeja en el alcance que cuenta ese número. Nunca un contador
   "decorativo" con un botón aparte que repita el destino.
2. **El texto del botón es la acción** con su emoji (`⏱ Ingresar turno extra`,
   `➕ Nuevo ticket`) — nunca un "Abrir" genérico. Los links a la web dicen a
   dónde van (`Abrir en OPAI`, `✏️ Completar en OPAI`).
3. **Revelación progresiva.** El Home muestra 3-4 accesos contextuales por rol;
   `⚡ Todas las acciones` es la ÚNICA puerta a la cola larga (el hub). Agregar
   una acción nueva = agregarla al registro del hub, NO al Home.
4. **Cero duplicados semánticos.** Ninguna acción aparece dos veces en el Home;
   si un contador ya navega a una bandeja, esa bandeja no tiene otro botón. Una
   acción que es un *tipo* de otra (vacaciones = tipo de ticket) no es una
   entrada propia.
5. **Defaults = el caso del 90%.** Mis tickets aterriza en "Míos"; Mis
   rendiciones aterriza en "Enviadas"; el botón de vencidos abre YA filtrado.
   Los chips permiten cambiar, pero el primer render es el caso personal.

## B1 — Hub semánticamente correcto

- **"Solicitud de vacaciones" eliminada como acción propia** (era un TIPO de
  ticket, `solicitud_vacaciones`): vive en el selector de tipos de "Nuevo
  ticket", que lista los `OpsTicketType` activos con `origin` internal/both.
  Requisito de datos: el tipo debe estar activo con ese origen en el tenant.
  Se borró `actions/vacaciones.ts` (no había subcomando `/opai vacaciones` ni
  shortcut del manifest apuntándole).
- **"Ingresar turno extra"** (antes "Turno extra"): la acción registra al
  GUARDIA que entra a cubrir — guardia existente (RUT o código) + instalación +
  fecha + tipo — vía `createTurnoExtra` (mismo servicio que la web; queda
  `pending`). El flujo destino ya era el correcto; el fix fue label + copy +
  orden de campos. Para PERSONAS nuevas (alta con datos personales/bancarios,
  Google Maps) el modal enlaza `/personas/guardias/ingreso-te` — ese alta no es
  replicable en un modal Slack y no se finge.
- **"Visita de supervisor"** sin cambios: deep-link honesto a
  `/ops/supervision/nueva-visita` (la visita exige GPS real) — verificado.
- **Botones del hub**: `${emoji} ${title}` desde el registro (`ActionDef.emoji`),
  `action_id` único `opai_action_open_<callbackId>`, grupos con header +
  divider, máx. 3 botones por actions block.

## B2 — Home rediseñado (estructura fija)

1. **"Tu día"** — contadores accionables: `🎫 {míos} abiertos` (→ Mis tickets
   en "Míos", primary) · `🔴 {n} SLA vencidos` (→ bandeja vencidos alcance "Mi
   equipo" — el MISMO que cuenta el número; danger si >0) · `✅ {n} por aprobar`
   (→ bandeja unificada F13; OCULTO si 0). Debajo, el desglose F11 en una línea
   `context`: `👤 tuyos · 👥 de tu equipo · ⚪ sin asignar` (sin-asignar solo
   con visión global = módulo ops).
2. **Divider.**
3. **"Accesos rápidos"** — máx. 4 contextuales por rol: `➕ Nuevo ticket` (ops)
   · `📊 Pipeline` (crm/deals) · `📇 {n} leads sin tomar` (crm/leads; el
   contador es el botón: con pendientes abre la sub-bandeja sin-tomar, sin
   pendientes abre la bandeja general) · `🧾 Nueva rendición` (finance edit) +
   `⚡ Todas las acciones` al final. Se ELIMINARON el panel Comercial con
   contadores propios y la lista larga que duplicaba el hub.
4. **Footer** de una línea: ``Escríbeme `@OPAI` o usa `/opai ayuda` ``.

Máx. 3 botones por `actions` block (Slack Home apila el resto de filas solo).

## B3 — Defaults + Mis rendiciones gestionables

- **Mis tickets** aterriza en scope `mine` (antes `my_team`); los chips F11
  siguen permitiendo cambiar. `opai_tickets_vencidos` fija `my_team` explícito.
- **Mis rendiciones** (`modals/mis-rendiciones.ts`):
  - Chips sobre los estados REALES (`DRAFT | SUBMITTED | IN_APPROVAL | APPROVED
    | REJECTED | PAID`): **Enviadas** (SUBMITTED+IN_APPROVAL, default) ·
    Borradores (DRAFT) · Aprobadas (APPROVED+PAID) · Rechazadas (REJECTED).
  - Cada fila: link al detalle canónico `/finanzas/rendiciones/{id}` ("Abrir en
    OPAI"; en borradores "✏️ Completar en OPAI") + 📎 Boleta si existe.
  - **Borrador → 🗑 Eliminar** con `confirm` nativo: misma regla que
    `DELETE /api/finance/rendiciones/[id]` (solo DRAFT, solo el submitter, gate
    `canDelete(finance, rendiciones)`), `logAudit` DELETE.
  - **Enviada/En aprobación → ↩️ Retirar**: la transición SUBMITTED→DRAFT
    existe en el servicio SOLO como reversión administrativa
    (`/api/finance/rendiciones/[id]/revert`, capability `rendicion_configure`).
    Se cabló con ese MISMO gate + ser el submitter: confirmación nativa,
    approvals pendientes eliminadas (se recrean al re-enviar, igual que el
    revert a DRAFT de la web), registro en `FinanceRendicionHistory`
    (action `REVERTED`, comment "Retirada por el solicitante desde Slack") y
    `logAudit`. **Sin la capability, la fila solo ofrece el link** (no se
    inventó una transición self-service que la web no tiene). **Eliminar duro
    de una ENVIADA queda excluido** (está en flujo de aprobación — regla de
    irreversibles).
- Tarjetas de entidad del asistente (`bot.ts`): botón "Abrir" → "Abrir en OPAI".

## Matriz de pruebas manuales (Fase 20)

> No ejecutable en la sesión de Claude (sin workspace Slack ni DB). Mocks a
> 375px verificados en el reporte de la sesión. Checklist para Carlos:

- [ ] Home a **375px**: filas de máx. 3 botones, sin desbordes; ningún "Abrir";
      ninguna acción repetida.
- [ ] `🎫 N abiertos` abre Mis tickets **en "Míos"** y N coincide; `🔴` abre la
      bandeja de vencidos ya filtrada (alcance Mi equipo, mismo número);
      `✅ por aprobar` abre la bandeja unificada y desaparece cuando llega a 0.
- [ ] Hub (⚡): sin "Solicitud de vacaciones"; el tipo aparece dentro de
      "Nuevo ticket" → selector de tipos (si no aparece: revisar que el
      `OpsTicketType` esté activo con origin internal/both).
- [ ] `⏱ Ingresar turno extra`: ingreso completo de un TE con guardia REAL
      (RUT o código) + instalación + fecha → queda `pending` y visible en
      `/te`; duplicado (mismo guardia+fecha+puesto) rechaza con error en campo;
      RUT inexistente sugiere el alta en `/personas/guardias/ingreso-te`.
- [ ] `📍 Visita de supervisor` abre y su botón aterriza en
      `/ops/supervision/nueva-visita`.
- [ ] Mis rendiciones aterriza en **Enviadas**; "Abrir en OPAI" aterriza en el
      detalle correcto; 🗑 en borrador pide confirmación y elimina (aviso en el
      modal + auditoría); ↩️ Retirar visible SOLO con `rendicion_configure`,
      vuelve a Borrador y queda en el historial de la rendición (REVERTED).
- [ ] Títulos de modal ≤24 chars en todos los flujos tocados.

# Fase 21 — Pipeline clase mundial: drill que abre siempre · buscador universal · rediseño visual

## B1 — BUG: el drill solo abría en Prospección (causa real + blindaje)

**Diagnóstico con evidencia** (runtime logs de Vercel, ruta
`/api/integrations/slack/interactivity`): cada clic fallido registraba
`views.push invalid_arguments` con títulos ≤24 chars ("Cotización enviada",
"Primer seguimiento", "Segundo seguimiento", "Negociación") — el clamp del F14
estaba bien; lo rechazado era el *payload de bloques*. La única pieza del view
que dependía de los datos era la opción de overflow **"📞 Llamar" con URL
`tel:`** — y Slack solo acepta `http(s)` en URLs de botones/opciones dentro de
modales. Prospección abría porque era la única etapa cuyos deals no tenían
contacto con teléfono; las demás (negocios reales) sí, y el modal completo
moría en silencio.

Fix + blindaje permanente (`comercial/pipeline.ts`, `api.ts`):

- **Sin `tel:` en modales** (LÍMITE F21 documentado en el header del módulo):
  el contacto telefónico queda vía 🟢 WhatsApp (https, mismo número). Los links
  mrkdwn `tel:` en MENSAJES (lead card) siguen funcionando.
- **Null-safety total** en el builder de fila (`dealRowBlocks`): cuenta,
  título, monto, fechas y contacto con fallback — jamás asumir presencia.
- **try/catch por FILA**: una fila corrupta se salta con log (`dealId` +
  etapa), no mata el modal; si hubo filas saltadas, el modal lo dice.
- **Loading-first en `pipe_open`** (patrón F11/F14): se apila el modal de
  carga de inmediato (consume el `trigger_id` perecedero) y el contenido llega
  por `views.update`; si falla, el usuario ve "⚠️ No se pudo cargar esta
  etapa" — nunca un botón mudo.
- **`SlackApiError` ahora captura `response_metadata.messages`** (el
  json-pointer al bloque ofensor) y `callViewMethod` lo loguea en
  `invalid_arguments`/`invalid_blocks`: ningún rechazo de view vuelve a ser
  indescifrable.
- Estado vacío elegante para etapas sin negocios.

## B2 — Buscador universal de negocios (`/opai negocio <texto>`)

`comercial/deal-search.ts` + `findCrmDealIdsUniversalSearch` en
`src/lib/search-normalize.ts` (mismo patrón accent-insensitive `f_unaccent`
del search global).

- **Entradas**: `/opai negocio <texto>`, alias `/opai buscar negocio <texto>`
  (interceptado en `commands.ts` antes del subcomando `buscar` del asistente),
  botón `🔎 Buscar negocio` en el header del pipeline (`pipe_search`,
  loading-first) y acción en el hub, grupo **Comercial** (gate: ver Negocios
  CRM — la misma capability del pipeline).
- **Relación negocio↔instalación (auditada)** — se recorren los TRES caminos
  reales del esquema:
  1. `crm.deals.installation_name` — campo directo desnormalizado (migración Soho);
  2. `cpq.quotes.installation_id` — instalaciones de sus cotizaciones CPQ,
     vinculadas por `q.deal_id` directo O por `crm.deal_quotes`;
  3. `crm.installations.activated_by_deal_id` — instalación activada por el deal.
- Matching parcial + normalización de acentos; máx 10 resultados, orden por
  `updated_at DESC`.
- **Alcance por chips**: `Abiertos` (default) · `🏆 Ganados` · `❌ Perdidos` ·
  `Todos` — un negocio cerrado es encontrable (post-mortem, reactivación,
  abrir su sala). Los chips releen el texto TIPEADO del input (view.state), no
  solo el último buscado.
- **Cada resultado**: `*Cuenta* · negocio · $monto · etapa/estado (🏆/❌) · ⏱ Nd`
  con `🏠 Abrir sala` (crea o entra — `openDealRoom` F16 no filtra por estado,
  funciona para cerrados) / `🏠 Ir a la sala` (deep-link si ya hay sala OPEN),
  `🔗 Abrir en OPAI` y `🟢 WhatsApp` si hay contacto con teléfono. Sin
  resultados → estado vacío con sugerencia (y hint del chip `Todos` si el
  alcance era Abiertos).

## B3 — Rediseño clase mundial del modal Pipeline

- **Header protagonista**: `💼 *Pipeline comercial* — 16 negocios ·
  *$63.762.420* abiertos` + botones `🔎 Buscar negocio` y `📊 Abrir en OPAI`
  (vista web del pipeline: `/crm/deals`, kanban/lista — auditada).
- **Cada etapa como bloque denso**: nombre en bold + `N negocios · $monto ·
  X% del total` + mini-barra proporcional de 10 celdas `▓▓▓▓░░░░░░` (monto vs
  total, entre backticks para ancho fijo → barras alineadas a 375px) +
  `🔴 N fríos` si hay deals >14d en la etapa (`countColdByStage` usa el MISMO
  cálculo del semáforo del drill F17: última entrada por
  `CrmDealStageHistory`, fallback `createdAt` — overview y drill nunca se
  contradicen).
- **Botón por etapa con texto propio**: `3 negocios →` (nada de "Ver →"
  repetido, principio F20).
- **Plegado**: con más de 8 etapas, el excedente va en `…y N etapas más` con
  botón `+N etapas →` (`pipe_more` re-renderiza expandido). Presupuesto de
  blocks: 13 con 12 etapas (límite Slack: 100).
- **Footer**: `Total abierto: *$X* · Actualizado hace un momento`.

## Matriz de pruebas manuales (Fase 21)

> Verificado en la sesión: typecheck, render simulado del overview (barras
> suman 10 celdas proporcionales, líneas ≤40 chars a 375px), unicidad de
> action_ids, cero URLs no-https en modales, títulos ≤24. No ejecutable sin
> workspace Slack ni DB de producción — checklist para Carlos:

- [ ] Las **5 etapas** abren el drill con los negocios REALES de producción
      (incluidos deals sin contacto/teléfono/actividad); una etapa vacía
      muestra el estado vacío elegante.
- [ ] `/opai negocio polpaico` encuentra el negocio por su INSTALACIÓN;
      `/opai buscar negocio <texto>` hace lo mismo.
- [ ] Buscar un GANADO histórico (chip 🏆 o Todos) y abrirle sala para el
      post-mortem — la sala se crea/entra igual que en el pipeline.
- [ ] Las barras del overview suman proporciones coherentes y el `🔴 N fríos`
      coincide con los deals 🔴 del drill de esa etapa.
- [ ] Ningún botón con texto genérico ("Ver"/"Abrir" pelados) en pipeline,
      drill ni buscador.
- [ ] 375px (Slack iOS): barras alineadas, sin desbordes, chips en una fila.
- [ ] Si un view vuelve a ser rechazado, el log de Vercel ahora muestra el
      `detalle:` con el json-pointer del bloque ofensor.
