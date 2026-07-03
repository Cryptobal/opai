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
