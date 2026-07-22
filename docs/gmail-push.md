# Gmail push en tiempo real (Cloud Pub/Sub)

Gmail empuja una notificación cuando cambia la casilla completa (mensajes,
labels, archivado, papelera y leído). OPAI la encola por cuenta, aplica el delta
de `historyId` y avisa al navegador por Pusher. La ruta normal tarda 2–5 s; como
Pub/Sub no ofrece una garantía estricta de latencia, el cron de un minuto
recupera jobs y el de 10 minutos hace reconciliación completa.

Es **opt-in por env**: sin `GMAIL_PUSH_ENABLED=true`, todo el mecanismo es no-op
y el polling del cron sigue siendo la red de seguridad.

## Infraestructura GCP (producción)

- Proyecto: `maps-v1-453322`
- Topic: `projects/maps-v1-453322/topics/opai-gmail`
- Suscripción push: `opai-gmail-push` → endpoint con token en query string
- Publisher: `gmail-api-push@system.gserviceaccount.com` en el topic

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `GMAIL_PUSH_ENABLED=true` | Activa `users.watch` y el webhook |
| `GMAIL_PUSH_TOPIC` | Topic donde Gmail publica |
| `GMAIL_PUSH_TOKEN` | Verifica el push subscription (token en query, legacy) |
| `GMAIL_PUSH_AUDIENCE` | Audience del JWT OIDC = URL pública del webhook (ej. `https://www.opai.cl/api/webhook/gmail`) |
| `GMAIL_PUSH_SA_EMAIL` | Service account que Pub/Sub usa para firmar el JWT OIDC |
| `GMAIL_PUSH_OIDC_REQUIRED` | `true` = rechaza con 403 pushes sin JWT OIDC válido; ausente/`false` = modo transición (acepta con token de query y loggea el estado del JWT) |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` | Emisión privada server-side |
| `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` | Suscripción del navegador |
| `R2_*` | Staging de adjuntos salientes |

## Autenticación OIDC del push (V3)

Pub/Sub puede firmar cada push con un JWT OIDC. El webhook lo verifica con
`google-auth-library` (`verifyIdToken`): firma contra los certs de Google,
`aud` = `GMAIL_PUSH_AUDIENCE`, issuer de Google y
`email`/`email_verified` = `GMAIL_PUSH_SA_EMAIL`.

Para que Pub/Sub envíe el token hay que actualizar la suscripción (la service
account necesita el rol `roles/iam.serviceAccountTokenCreator` para
`service-{PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com`, y el caller
`iam.serviceAccounts.actAs` sobre ella):

```bash
gcloud pubsub subscriptions update opai-gmail-push \
  --project=maps-v1-453322 \
  --push-endpoint="https://www.opai.cl/api/webhook/gmail?token={GMAIL_PUSH_TOKEN}" \
  --push-auth-service-account="{GMAIL_PUSH_SA_EMAIL}" \
  --push-auth-token-audience="https://www.opai.cl/api/webhook/gmail"
```

Despliegue seguro en dos pasos:

1. Deploy con `GMAIL_PUSH_AUDIENCE` + `GMAIL_PUSH_SA_EMAIL` y
   `GMAIL_PUSH_OIDC_REQUIRED` ausente (modo transición). Ejecutar el
   `gcloud … update` de arriba y verificar en logs que desaparece el warning
   `push sin OIDC válido`.
2. Setear `GMAIL_PUSH_OIDC_REQUIRED=true`. Desde ahí, un push sin JWT válido
   recibe 403. Rollback: volver a quitar la variable.

## Cómo funciona en OPAI

- **Al conectar la casilla** se registra `users.watch` sin filtro de label
  (mailbox completo), se encola el backfill y se intenta procesarlo con
  `after()`.
- **El watch se renueva a diario** en el cron `calendar-channel-renew`: Google
  expira el watch a los ~7 días; se renueva cuando faltan menos de 24h (cap 50
  casillas/corrida). También registra casillas conectadas antes del push.
- **La notificación push** llega a `POST /api/webhook/gmail?token=…`. Valida el
  token, hace upsert en `crm.gmail_sync_jobs`, responde 204 y ejecuta un delta
  corto con `after()`. El lease singleton evita cron/webhook simultáneos; un
  push recibido durante la corrida vuelve a marcar `pending=true`.
- **Al terminar el delta**, el servidor emite `mailbox-changed` al canal privado
  `private-crm-correos-{tenantId}-{userId}`. El evento no lleva PII: el cliente
  vuelve a consultar lista, conteos y detalle abierto.
- **Fallbacks**: `flush-gmail-sync` corre cada minuto; `gmail-sync-all` cada 10
  minutos agrega Radar, self-heal y sweep. Si Pusher no está disponible, el
  cliente revalida al volver a foco/online y cada 30 s mientras está visible.
- **Al desconectar** la casilla se llama `stopGmailWatch` (best-effort).

## Post-deploy (Carlos)

Tras merge y con las 3 env vars en Production:

1. Editar la suscripción `opai-gmail-push` en GCP para que el endpoint sea:
   `https://www.opai.cl/api/webhook/gmail?token={GMAIL_PUSH_TOKEN}`
2. Confirmar que las variables Pusher server/client están presentes.
3. Ejecutar la migración que crea `crm.gmail_sync_jobs`.
4. Reconectar una casilla (o esperar al cron diario) para reemplazar el watch
   histórico filtrado a INBOX por el watch mailbox-wide.
5. Verificar en logs la secuencia `push → job → delta → mailbox-changed` y que
   `last_completed_at` avance en `crm.gmail_sync_jobs`.

## Desactivar

Quitar `GMAIL_PUSH_ENABLED` (o ponerlo distinto de `true`). El webhook responde
204 sin procesar y `gmail-sync-all` sigue cubriendo la casilla cada 10 minutos.
Si solo Pusher falla, la sincronización backend continúa y la UI usa polling.
