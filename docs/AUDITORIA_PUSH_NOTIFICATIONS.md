# Auditoría Completa: Sistema de Push Notifications en OPAI

**Fecha:** 2026-03-09
**Alcance:** 5 PWAs (OPAI principal, Clientes, Supervisores, Guardias, Rondas)

---

## 1. Latencia de Push Notifications

### Archivos relevantes
- `src/app/api/chat/channels/[id]/messages/route.ts` (línea ~404) — disparo admin
- `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts` (línea ~307) — disparo guardia
- `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts` (línea ~307) — disparo cliente
- `src/lib/pwa/push-service.ts` — lógica central de envío push
- `src/lib/notification-service.ts` — sistema de notificaciones bell/email (separado del push)

### Estado actual

**Provider:** Web Push (librería `web-push` con VAPID keys). NO se usa Firebase/FCM.

**Flujo completo (mensaje de chat → push):**
1. El API route recibe el POST del mensaje de chat
2. Se crea el mensaje en la BD (síncrono, bloquea la respuesta)
3. Se dispara el evento Pusher **fire-and-forget** (`.catch()` silencia errores)
4. Se dispara `sendChatPushNotifications()` también **fire-and-forget** vía dynamic import:
   ```ts
   import("@/lib/pwa/push-service").then(({ sendChatPushNotifications }) =>
     sendChatPushNotifications({ ... })
   ).catch((err) => console.error("Error sending chat push:", err));
   ```
5. Dentro de `sendChatPushNotifications()`:
   - Resuelve todos los recipients del canal (2-4 queries a la BD)
   - Consulta preferencias per-channel (1 query)
   - Filtra MUTED
   - Para cada recipient: verifica preferencias de portal user (1 query) + config global (1 query) + busca suscripciones activas (1 query) + envía con `webPush.sendNotification()`
6. Se retorna la respuesta HTTP **antes** de que las push terminen de enviarse

**Cola/Queue:** NO hay cola. El envío es directo dentro del proceso Node.js del API route. Se usa `Promise.allSettled()` para enviar a todos los recipients en paralelo.

**Blocking:** NO bloquea la respuesta del API route (fire-and-forget con dynamic import).

**Delay/Batching/Throttling:** NO hay ninguno. Se envía inmediatamente al crear el mensaje.

### Problemas detectados

1. **N+1 queries por recipient:** Para cada recipient, `sendPushToPortalUser()` ejecuta 3 queries individuales (preferencias, config global, suscripciones). Con 10 recipients = ~30 queries adicionales por mensaje.
2. **Sin cola de mensajes:** Si el proceso del serverless function se corta antes de que terminen los push (ej: timeout de Vercel), se pierden silenciosamente.
3. **Dynamic import en cada mensaje:** `import("@/lib/pwa/push-service")` se ejecuta en cada mensaje. Aunque Node cachea los módulos, es innecesario.

### Recomendación
- Batch las queries de preferencias y suscripciones para todos los recipients de una sola vez (similar a `batchUnreadCounts`)
- Considerar una cola (Inngest, QStash, o similar) para garantizar delivery
- Cambiar el dynamic import a un import estático

---

## 2. Preferencias de Notificación por Canal de Chat

### Archivos relevantes
- `prisma/schema.prisma` (línea ~5820) — modelo `ChatNotificationPreference`
- `src/app/api/chat/channels/[id]/notification-preference/route.ts` — API GET/PUT
- `src/lib/pwa/push-service.ts` (línea ~341-355) — verificación al enviar push
- `src/components/chat/ChatPresenceBar.tsx` — UI del dropdown

### Estado actual

**Modelo Prisma:**
```prisma
model ChatNotificationPreference {
  channelId  String  @db.Uuid
  userType   String  // 'ADMIN', 'GUARD', 'CLIENT'
  userId     String
  preference String  @default("ALL") // 'ALL', 'MENTIONS_ONLY', 'MUTED'
  @@map("notification_preferences")
  @@schema("chat")
}
```

**Valores posibles:** `ALL`, `MENTIONS_ONLY`, `MUTED`

**UI:** Existe un dropdown en `ChatPresenceBar.tsx` con 3 opciones (Bell = ALL, AtSign = MENTIONS_ONLY, BellOff = MUTED). Se muestra en la barra superior de cada conversación.

**API:** GET y PUT en `/api/chat/channels/[id]/notification-preference`. Solo soporta userType `"ADMIN"` (hardcoded).

### Problemas detectados

1. **`MENTIONS_ONLY` NO ESTÁ IMPLEMENTADO en el backend.** En `push-service.ts` línea 354-355, solo se verifica `MUTED`:
   ```ts
   const pref = prefMap.get(`${r.subscriberType}:${r.subscriberId}`) || 'ALL';
   if (pref === 'MUTED') return Promise.resolve();
   // ← NO hay check para MENTIONS_ONLY
   ```
   Un usuario que selecciona "Solo menciones" recibe TODOS los mensajes igual que si tuviera "Todos".

2. **No hay detección de menciones en el flujo de push.** `sendChatPushNotifications` no recibe información de a quién se menciona en el mensaje. Para implementar `MENTIONS_ONLY`, necesitaría recibir la lista de usuarios mencionados y solo enviar push si el recipient está en esa lista.

3. **Solo admins pueden cambiar preferencia.** El API route hardcodea `userType: "ADMIN"`. Guardias y contactos de portales no tienen acceso a este endpoint.

### Recomendación
- Implementar la lógica de `MENTIONS_ONLY`: pasar las menciones del mensaje a `sendChatPushNotifications`, y filtrar recipients que tengan esta preferencia y no estén mencionados
- Exponer el endpoint de preferencias para guardias y contactos
- O bien, remover la opción `MENTIONS_ONLY` del UI si no se va a implementar pronto

---

## 3. Contenido del Banner de Notificación Push

### Archivos relevantes
- `public/sw.js` (líneas 87-182) — service worker principal (OPAI + portales compartidos)
- `public/sw-acceso.js` (líneas 82-199) — service worker de Control de Acceso
- `public/sw-cliente.js` — service worker del portal cliente
- `src/lib/pwa/push-service.ts` (líneas 108-126) — payload que se envía

### Estado actual

**Payload enviado por el servidor:**
```json
{
  "title": "NombreSender · NombreCanal",
  "body": "Preview del mensaje (max 120 chars)…",
  "icon": "/iconos_azul/icon-192x192.png",
  "badge": "/iconos_azul/icon-192x192.png",
  "tag": "chat-{channelId}",
  "data": {
    "url": "/chat?channel={channelId}",
    "type": "chat_message",
    "notificationId": undefined,
    "badgeCount": undefined
  }
}
```

**Service worker (`sw.js`) — evento `push`:**
```js
self.addEventListener('push', (event) => {
  // Parsea JSON, muestra notification con:
  // - title, body, icon, badge, image, tag
  // - renotify: true (si hay tag → reemplaza notification del mismo canal)
  // - vibrate: [200, 100, 200]
  // - actions: del payload (pero nunca se envían para chat)
  // - data: { url, type, notificationId, badgeCount }
});
```

**Service worker — evento `notificationclick`:**
```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Limpia badge
  navigator.clearAppBadge();
  // Marca notificación como leída (si tiene notificationId)
  // → Para chat messages, notificationId NO se envía, así que este PATCH nunca se ejecuta para chat
  // Navega a data.url (ej: /chat?channel=xxx)
  // Reutiliza ventana existente del mismo origin si hay una abierta
});
```

**Agrupación con `tag`:** SÍ se usa `tag: "chat-{channelId}"` con `renotify: true`. Esto significa que múltiples mensajes del mismo canal reemplazan la notification anterior (solo se ve la última).

### Problemas detectados

1. **`sw-cliente.js` NO tiene handler de push.** El service worker del Portal Cliente no tiene `addEventListener('push', ...)` ni `addEventListener('notificationclick', ...)`. Los clientes del portal que reciban una push NO verán ninguna notificación. El archivo solo tiene handlers de install, activate y fetch.

2. **No hay SW para guardias ni rondas** como archivos separados. Usan el `sw.js` principal, lo cual funciona, pero si se necesitara personalizar la experiencia para esas PWAs, no hay separación.

3. **`notificationId` nunca se envía en chat pushes.** En `sendChatPushNotifications`, el parámetro se omite, por lo que el click en una push de chat NO marca nada como leído en el servidor.

4. **`badgeCount` nunca se envía en chat pushes.** El badge se setea con `notifData?.badgeCount || 1` (siempre 1 por defecto). No refleja el conteo real de mensajes no leídos.

5. **El `body` trunca a 120 caracteres** pero el contenido del archivo adjunto dice `[Archivo adjunto]` que es poco informativo.

### Recomendación
- Agregar handlers de push y notificationclick a `sw-cliente.js`
- Pasar `badgeCount` real (total de unreads) al enviar la push
- Considerar incluir avatar/imagen del sender si está disponible

---

## 4. Badge Counter (numerito en el ícono de la PWA)

### Archivos relevantes
- `public/sw.js` (líneas 129-133, 142-145) — setAppBadge/clearAppBadge
- `public/sw-acceso.js` (líneas 123-126, 135-137) — igual
- `public/sw-cliente.js` — SIN badge API
- `src/lib/pwa/push-service.ts` (línea 55, 69) — parámetro badgeCount
- `src/components/chat/ChatFloatingProvider.tsx` — totalUnread cliente

### Estado actual

**Badge API en Service Worker:**
- `sw.js` y `sw-acceso.js`: SÍ usan `navigator.setAppBadge(count)` en el evento push
- `sw-cliente.js`: NO implementa Badge API (no tiene handler de push)
- El count viene de `notifData?.badgeCount || 1` → **siempre es 1** porque `badgeCount` nunca se pasa en chat pushes

**Cuándo se incrementa:** Cada push notification que llega setea el badge a `badgeCount || 1`. No es incremental, es absoluto. Si llegan 3 push, el badge queda en 1 (no en 3).

**Cuándo se limpia:**
- **Click en notification:** `navigator.clearAppBadge()` en el notificationclick handler → limpia TODO el badge, no decrementalmente
- **Al abrir la app:** NO se limpia automáticamente
- **Al leer mensajes:** NO se limpia
- **Al marcar chats como leídos:** NO se limpia

**No hay sincronización** entre el badge y el estado real de mensajes no leídos. El badge es puramente cosmético y siempre muestra "1" o se limpia completamente.

### Problemas detectados

1. **Badge siempre es 1.** El parámetro `badgeCount` existe en la interfaz pero nunca se calcula ni se pasa.
2. **Badge no se limpia al abrir la app.** Si el usuario abre la app haciendo click en el ícono (no en la notification), el badge persiste indefinidamente.
3. **Badge no se sincroniza con unreads reales.** No hay lógica que al consultar unread counts también actualice el badge.
4. **`sw-cliente.js` no tiene badge.** Portal Clientes nunca muestra badge en el ícono de la PWA.
5. **clearAppBadge limpia todo.** Si el usuario tiene notifications de múltiples canales, un click limpia todo en vez de decrementar.

### Recomendación
- Calcular `badgeCount` real (total de unreads para ese usuario) antes de enviar la push
- Agregar `navigator.clearAppBadge()` al inicio de la app (en el layout/provider principal)
- Sincronizar el badge cuando se pollea unread counts (cada 30s)
- Implementar badge en `sw-cliente.js`

---

## 5. Notificaciones In-App en Desktop (Toasts)

### Archivos relevantes
- `src/components/chat/hooks/useChatChannel.ts` — Pusher event bindings
- `src/components/chat/ChatFloatingProvider.tsx` — chat panel state
- Se usa `sonner` como librería de toasts (detectado en múltiples componentes operacionales)

### Estado actual

**Toasts para chat: NO EXISTEN.** Cuando llega un mensaje de chat vía Pusher:
1. Si el usuario está en el canal activo: el mensaje aparece en la conversación (via `appendMessage` en `useChatChannel`)
2. Si el usuario está en otro canal o en otra parte de la app: **no aparece ningún toast/banner**
3. El unread count se actualiza cada 30 segundos por polling (no en real-time para el badge del sidebar)

**Pusher events capturados:** `new-message`, `message-edited`, `message-deleted`, `reaction-added`, `reaction-removed`, `messages-cleared`, `client-typing`. Ninguno dispara un toast.

**Para notificaciones normales (bell):** El `NotificationContext` pollea cada 30s. NO hay Pusher channel para notificaciones en tiempo real. NO hay toast cuando llega una notificación nueva.

**Sonner se usa en otros contextos** (componentes operacionales como rondas, control de acceso, tickets) pero no para chat ni para notificaciones push.

### Problemas detectados

1. **Sin feedback visual in-app para mensajes de chat** cuando el usuario no está en el canal. El usuario solo se entera si:
   - Recibe la push notification del OS (requiere que la app esté en background/cerrada)
   - Mira el badge de unread del chat (que pollea cada 30s)
2. **Sin toast para notificaciones del sistema.** Las notificaciones bell también son silenciosas in-app — solo el badge numérico se actualiza por polling.
3. **Delay de hasta 30 segundos** para que el badge de unread se actualice en el sidebar/nav, porque es polling-based.

### Recomendación
- Agregar un Pusher channel global (ej: `private-user-{userId}`) que notifique mensajes nuevos en cualquier canal
- Mostrar un toast con sonner cuando llega un mensaje fuera del canal activo: "NombreSender en #Canal: preview..."
- El toast debería ser clickeable y navegar al canal
- Auto-dismiss después de 5-8 segundos
- No mostrar toast si el usuario ya está viendo ese canal

---

## 6. Módulo de Notificaciones vs Chat — Conteo

### Archivos relevantes
- `src/contexts/NotificationContext.tsx` — provider de notificaciones bell
- `src/components/opai/NotificationBell.tsx` — componente bell con badge
- `src/components/opai/NotificationListClient.tsx` — página de lista de notificaciones
- `src/components/chat/ChatFloatingProvider.tsx` — provider de chat con totalUnread
- `src/components/chat/hooks/useChatUnreadCounts.ts` — hook de unread counts de chat
- `src/components/opai/BottomNav.tsx` — badge de chat en nav inferior
- `src/components/opai/AppSidebar.tsx` — badges en sidebar
- `src/app/api/notifications/route.ts` — API de notificaciones
- `src/app/api/chat/unread-counts/route.ts` — API de unread counts de chat
- `src/lib/chat.ts` — `batchUnreadCounts()` SQL

### Estado actual

**Dos sistemas completamente independientes:**

| Aspecto | Notificaciones Bell | Chat Unreads |
|---------|---------------------|--------------|
| **Qué cuenta** | Notificaciones del sistema (tickets, leads, documentos, menciones en notas) | Mensajes de chat no leídos |
| **Dónde se muestra** | `NotificationBell` (campana con badge rojo, max "9+") | `ChatFloatingButton` (burbuja de chat) y `BottomNav` (tab Chat, max "99+") |
| **Cómo se calcula** | Query a tabla `notifications` filtrando por tenant, tipo, permisos y `NotificationReadState` | SQL query comparando `messages.created_at > read_cursors.last_read_at` por canal |
| **Polling** | Cada 30s (count-only lightweight) | Cada 30s (fetchChannels completo) |
| **Ruta** | `/opai/notificaciones` | Panel flotante de chat |
| **Contexto React** | `NotificationContext` | `ChatFloatingContext` |

**Los contadores NO se suman.** Son completamente separados en la UI.

**Cómo se resetea el unread de chat:**
- Al seleccionar un canal: optimistic update local `unreadCount: 0` + POST a `/api/chat/channels/[id]/read`
- Ese POST actualiza `ChatReadCursor.lastReadAt` → siguiente poll reflejará 0 unreads

**Cómo se resetea el unread de notificaciones:**
- Click en notificación individual → `markAsRead([id])` → PATCH `/api/notifications`
- "Marcar todas como leídas" → PATCH con `{ markAllRead: true }`
- Al hacer click en una push notification del OS → sw.js hace PATCH (solo si tiene `notificationId`)

### Problemas detectados

1. **Chat unreads pollea con fetchChannels completo.** Cada 30 segundos se trae la lista completa de canales con todos sus datos (no solo el count). Esto es costoso para tenants con muchos canales.

2. **No hay sincronización real-time de unread counts.** Aunque Pusher entrega mensajes en real-time al canal activo, el conteo de unreads en otros canales solo se actualiza por polling. Si el usuario está en el canal A y llega un mensaje al canal B, el badge del canal B tarda hasta 30s en aparecer.

3. **Push notifications de chat no incluyen `notificationId`.** Cuando el usuario hace click en una push de chat, el service worker no puede marcar nada como leído en el servidor, porque `notificationId` es undefined para push de chat.

4. **Inconsistencia en el optimistic update de chat.** Al seleccionar un canal se pone `unreadCount: 0` inmediatamente, pero si el POST de read cursor falla, el estado local queda en 0 y el real no. No hay rollback on error.

5. **El polling de notificaciones bell trae `limit=1` solo para el count.** Esto es eficiente, pero la query del servidor aún ejecuta toda la lógica de filtrado por permisos y broadcast vs targeted.

---

## Resumen de Bugs Críticos

| # | Bug | Severidad | Archivo |
|---|-----|-----------|---------|
| 1 | **`MENTIONS_ONLY` no implementado** — usuarios que eligen "Solo menciones" reciben TODAS las push | Alta | `src/lib/pwa/push-service.ts:354` |
| 2 | **`sw-cliente.js` sin handler de push** — Portal Clientes no muestra ninguna push notification | Alta | `public/sw-cliente.js` |
| 3 | **Badge siempre = 1** — `badgeCount` nunca se calcula ni se pasa | Media | `src/lib/pwa/push-service.ts:373` |
| 4 | **Badge no se limpia al abrir la app** — persiste indefinidamente | Media | No implementado |
| 5 | **Sin toast in-app para chat** — usuario no se entera de nuevos mensajes si no está en el canal | Media | No implementado |
| 6 | **Unread count delay de 30s** — polling-based en vez de real-time | Baja | `src/components/chat/ChatFloatingProvider.tsx:181` |
| 7 | **N+1 queries por recipient** en push dispatch | Baja | `src/lib/pwa/push-service.ts:58-137` |
| 8 | **No hay SW separados para guardias ni rondas** — usan sw.js compartido | Info | `public/` |
