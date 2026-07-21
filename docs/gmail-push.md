# Gmail push en tiempo real (Cloud Pub/Sub)

Estándar de las mejores apps de correo (Superhuman, Missive): en vez de esperar
al polling del cron (cada ~10 min), Gmail **empuja** una notificación apenas
llega un correo y OPAI sincroniza esa casilla al instante.

Es **opt-in por env**: sin `GMAIL_PUSH_TOKEN` + `GMAIL_PUBSUB_TOPIC`, todo el
mecanismo es no-op y el polling del cron sigue siendo la red de seguridad. No
hay que apagar nada para desactivarlo — simplemente no configures las env.

## Configuración en la consola de Google Cloud (~5 min, una vez)

1. **Crear el topic Pub/Sub** en el proyecto de Google Cloud:
   - `projects/{PROYECTO}/topics/opai-gmail`
2. **Dar permiso de publicación a Gmail** sobre ese topic:
   - Rol **Pub/Sub Publisher** al service account del sistema de Gmail:
     `gmail-api-push@system.gserviceaccount.com`
3. **Crear una push subscription** del topic hacia el webhook de OPAI:
   - Endpoint: `https://www.opai.cl/api/webhook/gmail?token={GMAIL_PUSH_TOKEN}`
   - Tipo: **Push**
   - (Recomendado) subir el *Acknowledgement deadline* a ~30s para dar margen al
     sync incremental antes de que Pub/Sub reintente.

## Variables de entorno

| Variable            | Ejemplo                                        | Uso                                            |
| ------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `GMAIL_PUBSUB_TOPIC`| `projects/opai/topics/opai-gmail`              | Topic al que Gmail publica (`users.watch`).    |
| `GMAIL_PUSH_TOKEN`  | (cadena aleatoria larga)                       | Verifica que el POST viene de nuestra subscription (`?token=`). |

## Cómo funciona en OPAI

- **Al conectar la casilla** (OAuth callback) se registra `users.watch` hacia el
  topic (`registerGmailWatch`), guardando `watchExpiration` en el `syncState`.
- **El watch se renueva a diario** en el cron `calendar-channel-renew`
  (`renewGmailWatches`): Google expira el watch a los ~7 días, así que se renueva
  cuando faltan menos de 48h.
- **La notificación push** llega a `POST /api/webhook/gmail`. El endpoint valida
  el token, decodifica el mensaje Pub/Sub (`{ emailAddress, historyId }`), ubica
  la casilla por email y dispara un `syncGmailAccount` **incremental** (deadline
  25s; el sweep de reconciliación queda para el cron). Responde **204 siempre**
  (Pub/Sub reintenta sólo ante 5xx) y el sync incremental es idempotente, así que
  una reentrega no duplica nada.

## Desactivar

Quitar `GMAIL_PUSH_TOKEN` (o `GMAIL_PUBSUB_TOPIC`). El webhook pasa a no-op y el
polling del cron `gmail-sync-all` sigue cubriendo la sincronización.
