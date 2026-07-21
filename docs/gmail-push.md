# Gmail push en tiempo real (Cloud Pub/Sub)

Estándar de las mejores apps de correo (Superhuman, Missive): en vez de esperar
al polling del cron (cada ~10 min), Gmail **empuja** una notificación apenas
llega un correo y OPAI sincroniza esa casilla al instante.

Es **opt-in por env**: sin `GMAIL_PUSH_ENABLED=true`, todo el mecanismo es no-op
y el polling del cron sigue siendo la red de seguridad.

## Infraestructura GCP (producción)

- Proyecto: `maps-v1-453322`
- Topic: `projects/maps-v1-453322/topics/opai-gmail`
- Suscripción push: `opai-gmail-push` → endpoint con token en query string
- Publisher: `gmail-api-push@system.gserviceaccount.com` en el topic

## Variables de entorno

| Variable              | Ejemplo                                              | Uso                                              |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `GMAIL_PUSH_ENABLED`  | `true`                                               | Activa registro de watch y procesamiento webhook |
| `GMAIL_PUSH_TOPIC`    | `projects/maps-v1-453322/topics/opai-gmail`          | Topic al que Gmail publica (`users.watch`)       |
| `GMAIL_PUSH_TOKEN`    | (cadena aleatoria larga)                             | Verifica el POST de la subscription (`?token=`)  |

## Cómo funciona en OPAI

- **Al conectar la casilla** (OAuth callback) se registra `users.watch` hacia el
  topic (`registerGmailWatch`), guardando `syncState.watch` con `historyId`,
  `expiration` y `registeredAt`.
- **El watch se renueva a diario** en el cron `calendar-channel-renew`: Google
  expira el watch a los ~7 días; se renueva cuando faltan menos de 24h (cap 50
  casillas/corrida). También registra casillas conectadas antes del push.
- **La notificación push** llega a `POST /api/webhook/gmail?token=…`. Valida
  token (403 si incorrecto), decodifica Pub/Sub (`{ emailAddress, historyId }`),
  coalescing anti-tormenta (5s), y dispara sync **incremental** (deadline 25s).
  Responde **204 siempre** ante errores de sync (el polling recupera).
- **Al desconectar** la casilla se llama `stopGmailWatch` (best-effort).

## Post-deploy (Carlos)

Tras merge y con las 3 env vars en Production:

1. Editar la suscripción `opai-gmail-push` en GCP para que el endpoint sea:
   `https://www.opai.cl/api/webhook/gmail?token={GMAIL_PUSH_TOKEN}`
2. Reconectar una casilla (o esperar al cron diario) para registrar el primer watch.

## Desactivar

Quitar `GMAIL_PUSH_ENABLED` (o ponerlo distinto de `true`). El webhook responde
204 sin procesar y el cron `gmail-sync-all` sigue cubriendo la sincronización.
