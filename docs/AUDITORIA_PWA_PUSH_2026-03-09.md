# Auditoría Completa: PWA Push Notifications — OPAI

**Fecha:** 2026-03-09
**Alcance:** 6 PWAs independientes (OPAI, Clientes, Guardias, Supervisores, Rondas, Acceso)

---

## PARTE A: Auditoría PWA por PWA

### Tabla Resumen

| Aspecto | OPAI (Admin) | Clientes | Guardias | Supervisores | Rondas | Acceso |
|---|---|---|---|---|---|---|
| **Manifest** | ✅ `/public/manifest.json` | ✅ `/public/manifest-cliente.json` | ✅ `/public/manifest-guardia.json` | ✅ `/public/manifest-supervisor.json` | ✅ `/public/portal-rondas-manifest.json` | ✅ `/public/manifest-acceso.json` |
| **scope** | `/` | `/portal/cliente` | `/portal/guardia` | `/portal/supervisor` | `/portal/rondas` | `/portal/acceso` |
| **display: standalone** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SW archivo** | `/sw.js` | `/sw.js` (migrado) | `/sw.js` | `/sw.js` | `/sw.js` | `/sw.js` |
| **SW registro** | `useServiceWorker()` → `register-sw.ts` | `PwaRegistrar.tsx` | `ServiceWorkerRegistrar.tsx` | `ServiceWorkerRegistrar.tsx` | `ServiceWorkerRegistrar.tsx` | `ServiceWorkerRegistrar.tsx` |
| **SW push handler** | ✅ | ✅ (usa sw.js) | ✅ (usa sw.js) | ✅ (usa sw.js) | ✅ (usa sw.js) | ✅ (usa sw.js) |
| **SW notificationclick** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SW badge API** | ✅ `setAppBadge` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PushPermissionPrompt** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **NO EXISTE** |
| **portalType suscripción** | `app` | `cliente` | `guardia` | `app` | `rondas` | ❌ N/A |
| **userType suscripción** | `admin` | `contact` | `guardia` | `admin` | `guardia` | ❌ N/A |
| **subscriberType en BD** | `ADMIN` | `CLIENT` | `GUARD` | `ADMIN` | `GUARD` | ❌ N/A |
| **API endpoint suscripción** | `/api/notifications/push/subscribe` | Mismo | Mismo | Mismo | Mismo | ❌ N/A |
| **Tiene chat** | ✅ | ✅ | ✅ | ✅ (usa ruta admin) | ✅ (usa ruta guardia) | ❌ NO |
| **Ruta API de chat** | `/api/chat/channels/[id]/messages` | `/api/portal/cliente/chat/...` | `/api/portal/guardia/chat/...` | `/api/chat/channels/[id]/messages` (admin) | `/api/portal/guardia/chat/...` | N/A |
| **Dispara push al enviar** | ✅ `sendChatPushNotifications()` | ✅ `sendChatPushNotifications()` | ✅ `sendChatPushNotifications()` | ✅ (vía ruta admin) | ✅ (vía ruta guardia) | N/A |
| **Pide permiso notificación** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

### Detalle por PWA

#### 1. OPAI (Admin)
- **Manifest:** `public/manifest.json` — `start_url: "/hub"`, `scope: "/"`
- **SW:** Registrado via `useServiceWorker()` hook → `register-sw.ts` → `/sw.js` con `scope: "/"`
- **Push:** `PushPermissionPrompt` en `AppLayoutClient.tsx:267` con `portalType="app"`, `userType="admin"`
- **Estado:** ✅ Completamente funcional

#### 2. Portal Clientes
- **Manifest:** `public/manifest-cliente.json` — `start_url: "/portal/cliente"`, `scope: "/portal/cliente"`
- **SW:** `PwaRegistrar.tsx` desregistra SWs antiguos (sw-cliente.js) y registra `/sw.js`
- **Push:** `PushPermissionPrompt` en `PortalClienteClient.tsx:370` con `portalType="cliente"`, `userType="contact"`
- **Chat API:** `/api/portal/cliente/chat/channels/[id]/messages/route.ts` — SÍ llama `sendChatPushNotifications()`
- **Estado:** ✅ Funcional (SW legacy en migración)

#### 3. Portal Guardias
- **Manifest:** `public/manifest-guardia.json` — `start_url: "/portal/guardia"`, `scope: "/portal/guardia"`
- **SW:** `ServiceWorkerRegistrar.tsx` → `/sw.js`
- **Push:** `PushPermissionPrompt` en `GuardPortalClient.tsx:156` con `portalType="guardia"`, `userType="guardia"`
- **Chat API:** `/api/portal/guardia/chat/channels/[id]/messages/route.ts` — SÍ llama `sendChatPushNotifications()`
- **Estado:** ✅ Funcional

#### 4. Portal Supervisores
- **Manifest:** `public/manifest-supervisor.json` — `start_url: "/portal/supervisor"`, `scope: "/portal/supervisor"`
- **SW:** `ServiceWorkerRegistrar.tsx` → `/sw.js`
- **Push:** `PushPermissionPrompt` en `PortalSupervisorClient.tsx:270` con `portalType="app"`, `userType="admin"`
- **Chat:** Usa la ruta ADMIN (`/api/chat/channels/[id]/messages`) directamente. El supervisor es un admin autenticado.
- **Estado:** ✅ Funcional (las suscripciones se guardan como ADMIN, no como SUPERVISOR)

#### 5. Portal Rondas
- **Manifest:** `public/portal-rondas-manifest.json` — `start_url: "/portal/rondas"`, `scope: "/portal/rondas"`
- **SW:** `ServiceWorkerRegistrar.tsx` → `/sw.js`
- **Push:** `PushPermissionPrompt` en `RondasPortalClient.tsx:482` con `portalType="rondas"`, `userType="guardia"`
- **Chat:** Usa la ruta GUARDIA (`/api/portal/guardia/chat/...`)
- **Estado:** ⚠️ Parcialmente funcional. Push subscription funciona (`rondas` es un portalType válido), pero la URL de click en la notificación apunta a `/portal/guardia?section=chat` en lugar de `/portal/rondas?section=chat` (ver SUBSCRIBER_TYPE_TO_PORTAL en push-service.ts:370-374)

#### 6. Portal Acceso
- **Manifest:** `public/manifest-acceso.json` — `start_url: "/portal/acceso"`, `scope: "/portal/acceso"`
- **SW:** `ServiceWorkerRegistrar.tsx` → `/sw.js` (registrado en layout)
- **Push:** ❌ **NO TIENE `PushPermissionPrompt`** — Nunca pide permiso, nunca suscribe
- **Chat:** ❌ **NO tiene chat** — No hay sección de chat ni API routes de chat
- **Estado:** ❌ **NUNCA recibirá push notifications** (pero no las necesita si no tiene chat)

---

## PARTE B: Diagnóstico de Latencia

### B1. Timeline del Flujo Completo

```
T+0ms      → POST /api/chat/channels/[id]/messages llega al servidor (Vercel serverless Node.js)
T+5-15ms   → Prisma: INSERT del mensaje en la BD (Neon PostgreSQL)
T+15-25ms  → Prisma: UPDATE del canal (lastMessageAt)
T+25-35ms  → Prisma: UPSERT del read cursor del sender
T+35ms     → Response HTTP construida (responseData)
T+35-40ms  → Pusher trigger fire-and-forget (.catch silencia errores)
T+40ms     → sendChatPushNotifications() llamada fire-and-forget
             ⚠️ NO hay waitUntil() — el runtime de Vercel puede matar el proceso aquí

--- Dentro de sendChatPushNotifications (si sobrevive) ---

T+40-45ms  → ensureVapidInitialized() — primera vez ~5ms, luego 0ms (cacheado en memoria)
T+45-60ms  → Query 1: getChatChannelRecipients() → prisma.chatChannel.findUnique
T+60-80ms  → Query 2: prisma.opsAsignacionGuardia.findMany (guardias del installation)
T+80-100ms → Query 3: prisma.crmInstallation.findUnique (accountId del installation)
T+100-120ms→ Query 4: prisma.crmContact.findMany (contactos del account)
T+120-140ms→ Query 5: prisma.chatReadCursor.findMany (guardias con cursor)
T+140-160ms→ Query 6: prisma.chatReadCursor.findMany (admins con cursor)
T+160-170ms→ Query 7: isGloballyEnabled() → prisma.setting.findFirst (cacheada 5min)
T+170-185ms→ Query 8: prisma.chatNotificationPreference.findMany (per-channel prefs)
T+185-200ms→ Query 9: prisma.chatPushSubscription.findMany (todas las suscripciones, BATCHED)
T+200-215ms→ Query 10: prisma.portalNotificationPreference.findMany (portal prefs, BATCHED)

--- Per-recipient (N recipients) ---

T+215-250ms→ Per recipient: calculateBadgeCount() → 2-3 queries adicionales POR RECIPIENT:
             - prisma.chatReadCursor.findMany (canales del usuario)
             - batchUnreadCounts() (conteo de no leídos)
             - Si admin: prisma.$queryRaw (bell notification count)
T+250-350ms→ Promise.allSettled(webPush.sendNotification()) — EN PARALELO por suscripción
             Cada llamada HTTP al push service ~50-200ms

T+350-600ms→ Push service de Apple/Google/Mozilla recibe y enqueue
T+600-2000ms→ Entrega al dispositivo (varía por OS, conectividad, Doze/standby)
T+2000ms+  → SW recibe push event → showNotification()
```

**Tiempo total estimado (servidor):** 250-600ms
**Tiempo total hasta la notificación visible:** 1-3 segundos (caso ideal), 5-30 segundos (dispositivo en standby)

### B2. Bottlenecks Identificados

#### TOP 3 Bottlenecks:

**1. 🔴 CRÍTICO: No hay `waitUntil()` — Las push pueden NO enviarse nunca**
- **Impacto:** ALTO — En Vercel serverless, una vez que se envía la respuesta HTTP, el runtime puede terminar el proceso. `sendChatPushNotifications()` se ejecuta fire-and-forget DESPUÉS del response.
- **Archivo:** `src/app/api/chat/channels/[id]/messages/route.ts:415-427`
- **También en:** `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts:306-320`
- **También en:** `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts:306-320`
- **Impacto estimado:** 10-50% de los push pueden perderse silenciosamente
- **Solución:** Usar `waitUntil()` de Next.js para extender la vida del serverless function

**2. 🟡 ALTO: `calculateBadgeCount()` ejecuta 2-3 queries POR RECIPIENT**
- **Impacto:** Si hay 10 recipients, son 20-30 queries adicionales SERIALES dentro del `Promise.allSettled` (cada recipient calcula su badge secuencialmente dentro de su propia promesa)
- **Archivo:** `src/lib/pwa/push-service.ts:62-102` y `:493`
- **Queries por recipient:**
  1. `chatReadCursor.findMany` — canales del usuario
  2. `batchUnreadCounts()` — conteos no leídos
  3. Si admin: raw query a `notifications` — bell unreads
- **Solución:** Pre-calcular badge counts en batch para todos los recipients de una vez, o usar un valor cached/estimado

**3. 🟡 MEDIO: Resolución de recipients hace 4-6 queries secuenciales**
- **Impacto:** 60-120ms de queries secuenciales para resolver quién debe recibir la notificación
- **Archivo:** `src/lib/pwa/push-service.ts:281-363` (`getChatChannelRecipients`)
- **Queries:** chatChannel.findUnique → opsAsignacionGuardia → crmInstallation → crmContact → chatReadCursor (guardias) → chatReadCursor (admins)
- **Solución:** Podrían paralelizarse algunas queries o cachear la lista de miembros del canal

### B3. Dynamic Import

No se usa dynamic import. La llamada en los 3 API routes es:
```typescript
// Admin route (direct import at top):
import { sendChatPushNotifications } from "@/lib/pwa/push-service";
// ...
sendChatPushNotifications({...}).catch(...);
```

El import es estático (línea 11 en cada archivo). El módulo se importa una vez y se cachea en Node.js. **No hay overhead de dynamic import.**

> **Nota:** El documento de auditoría anterior (`AUDITORIA_PUSH_NOTIFICATIONS.md`) menciona dynamic import, pero el código actual usa import estático. Esto fue probablemente corregido en una iteración posterior.

### B4. Queries Detalladas

Lista completa de queries desde POST hasta finalización de push:

| # | Query | Tabla | Propósito | ¿Necesaria? |
|---|-------|-------|-----------|-------------|
| 1 | `chatChannel.findUnique` | chat.chat_channels | Obtener tipo y datos del canal | ✅ Sí |
| 2 | `opsAsignacionGuardia.findMany` | ops.asignacion_guardia | Guardias asignados al installation | ✅ Sí |
| 3 | `crmInstallation.findUnique` | crm.installations | accountId para buscar contactos | ✅ Sí |
| 4 | `crmContact.findMany` | crm.contacts | Contactos del account con portal | ✅ Sí |
| 5 | `chatReadCursor.findMany` (GUARD) | chat.chat_read_cursors | Guardias que han leído el canal | ⚠️ Podría unirse con #2 |
| 6 | `chatReadCursor.findMany` (ADMIN) | chat.chat_read_cursors | Admins que participan en el canal | ✅ Sí |
| 7 | `setting.findFirst` | public.settings | Global notification config | ✅ (cacheada 5min) |
| 8 | `chatNotificationPreference.findMany` | chat.chat_notification_preferences | Prefs per-channel (BATCHED) | ✅ Sí |
| 9 | `chatPushSubscription.findMany` | chat.push_subscriptions | Suscripciones activas (BATCHED) | ✅ Sí |
| 10 | `portalNotificationPreference.findMany` | public.portal_notification_preferences | Prefs de portal users (BATCHED) | ✅ Sí |
| 11-13 | `calculateBadgeCount()` × N | Múltiples | Badge count PER RECIPIENT | ⚠️ **Bottleneck** |

**Total: 10 queries base + 2-3 queries × N recipients**

### B5. Vercel Serverless vs Edge

- **Runtime:** Node.js (no hay `export const runtime = 'edge'` en ningún chat route)
- **Cold starts:** Sí, posibles. Cada cold start puede tomar 200-500ms extra
- **`waitUntil()`:** ❌ **NO se usa en ningún chat route** — Este es el problema principal

### B6. Web Push Provider Timing

- **`webPush.sendNotification()`:** ~50-200ms por llamada HTTP a FCM/APNs/Mozilla
- **Paralelismo:** ✅ SÍ — usa `Promise.allSettled()` tanto para recipients como para suscripciones por usuario
- **Retry logic:** ❌ NO hay retry. Solo cleanup de suscripciones muertas (410/404 → `isActive: false`)
- **Cleanup de 410:** ✅ Implementado en `sendToSubscription()` (push-service.ts:106-124)

### B7. Neon PostgreSQL

- **Connection pooling:** PrismaClient singleton con `globalThis` cache (development). En producción Vercel serverless, cada cold start crea una nueva conexión
- **No hay pgBouncer/pooler explícito** en el DATABASE_URL (no visible en código)
- **Índices en push_subscriptions:**
  - ✅ `@@unique([endpoint])` — `uq_chat_push_subscription_endpoint`
  - ✅ `@@index([tenantId, subscriberType, subscriberId])` — `idx_chat_push_subscriptions_subscriber`
  - Los índices son adecuados para las queries que se ejecutan
- **Región:** No verificable desde el código, pero debería estar en la misma región que Vercel

---

## PARTE C: Búsqueda de Problemas Específicos

### C1. PWAs que NUNCA reciben push

| PWA | Registra SW | Pide permiso | Guarda subscription | SW tiene push handler | ¿Recibe push? |
|-----|------------|--------------|--------------------|-----------------------|----------------|
| OPAI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ | ✅ | ✅ |
| Guardias | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supervisores | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rondas | ✅ | ✅ | ✅ | ✅ | ✅ (pero URL de click incorrecta) |
| **Acceso** | ✅ | ❌ | ❌ | ✅ (sw.js) | ❌ **NUNCA** |

**Portal Acceso NUNCA recibirá push notifications** porque:
- No tiene `PushPermissionPrompt` → nunca pide permiso → nunca suscribe
- No tiene chat → no necesita push de chat
- Si se quisiera añadir push para otros tipos de notificación, falta todo el flujo client-side

### C2. Tipos de usuario excluidos del envío

En `push-service.ts:281-363` (`getChatChannelRecipients`):

```
Canal INSTALLATION:
  → GUARD: guardias asignados + guardias con read cursor ✅
  → CLIENT: contactos con portalEnabled del account ✅
  → ADMIN: admins con read cursor en el canal ✅

Canal GROUP:
  → ADMIN: miembros del grupo ✅
  → GUARD/CLIENT: ❌ NO incluidos (pero los grupos son solo de admins)

Canal DIRECT:
  → ADMIN: participantes del DM ✅
  → GUARD/CLIENT: ❌ NO incluidos (pero los DMs son solo entre admins)
```

**No hay filtro por userType que excluya a nadie incorrectamente.** Los GUARD y CLIENT se incluyen correctamente en canales de tipo INSTALLATION. Los canales GROUP y DIRECT son solo para admins por diseño.

**Sin embargo**, hay un detalle importante en `SUBSCRIBER_TYPE_TO_PORTAL`:
```typescript
const SUBSCRIBER_TYPE_TO_PORTAL: Record<string, 'app' | 'guardia' | 'cliente'> = {
  ADMIN: 'app',
  GUARD: 'guardia',   // ← Rondas guards get URL for /portal/guardia
  CLIENT: 'cliente',
};
```
No hay distinción entre un guardia en Portal Guardias y un guardia en Portal Rondas. Ambos reciben URL `/portal/guardia?section=chat`. Si un guardia SOLO usa Portal Rondas, el click lo llevará a la app incorrecta.

### C3. API Routes que disparan push

| Ruta API | ¿Llama sendChatPushNotifications? | senderType | ¿mentionedUserIds? | ¿imageUrl? |
|----------|-----------------------------------|------------|-------------------|------------|
| `/api/chat/channels/[id]/messages` (admin) | ✅ SÍ | `"ADMIN"` | ✅ Sí | ✅ Sí |
| `/api/portal/guardia/chat/...` | ✅ SÍ | `"GUARD"` | ❌ No envía | ❌ No envía |
| `/api/portal/cliente/chat/...` | ✅ SÍ | `"CLIENT"` | ❌ No envía | ❌ No envía |
| Portal Supervisor (usa ruta admin) | ✅ SÍ (vía admin) | `"ADMIN"` | ✅ Sí (vía admin) | ✅ Sí |
| Portal Rondas (usa ruta guardia) | ✅ SÍ (vía guardia) | `"GUARD"` | ❌ No envía | ❌ No envía |
| Portal Acceso | N/A — No tiene chat | N/A | N/A | N/A |

**Problema encontrado:** Las rutas de guardia y cliente NO pasan `mentionedUserIds` ni `imageUrl` a `sendChatPushNotifications()`. Esto significa que:
- El filtro `MENTIONS_ONLY` no funciona para mensajes enviados DESDE portales de guardia/cliente
- Las imágenes adjuntas no se muestran en la notificación push cuando el mensaje viene de guardia/cliente

### C4. Subscription Cleanup

- **Cleanup automático:** ✅ Sí. En `sendToSubscription()` (push-service.ts:116-123), cuando `webPush.sendNotification()` retorna 410 (Gone) o 404 (Not Found), la suscripción se marca como `isActive: false`
- **Duplicados:** Controlados por `@@unique([endpoint])`. Un mismo endpoint solo puede existir una vez. Si el mismo dispositivo re-suscribe, se hace upsert
- **Suscripciones viejas:** No hay limpieza periódica de suscripciones inactivas. Se acumulan con `isActive: false` indefinidamente
- **No hay TTL:** No se eliminan suscripciones que no se usen por X días

---

## PARTE D: Entregable Final

### 1. Lista de PWAs Rotas

| PWA | Estado | Problema | Archivo a corregir |
|-----|--------|----------|--------------------|
| **Acceso** | 🔴 ROTO | No tiene PushPermissionPrompt → nunca suscribe a push | Pero no tiene chat, así que **no aplica a chat**. Si se quieren push de otro tipo, añadir PushPermissionPrompt a su componente principal |
| **Rondas** | 🟡 PARCIAL | URL de click en notificación apunta a `/portal/guardia` en vez de `/portal/rondas` | `src/lib/pwa/push-service.ts:370-374` — SUBSCRIBER_TYPE_TO_PORTAL no distingue guardias de rondas vs guardias normales |

### 2. Problemas de Funcionalidad

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | **No hay `waitUntil()`** — Push puede no enviarse en Vercel serverless | 🔴 CRÍTICO | `src/app/api/chat/channels/[id]/messages/route.ts` y equivalentes guardia/cliente |
| 2 | **Rutas guardia/cliente no pasan `mentionedUserIds`** → MENTIONS_ONLY no funciona desde portales | 🟡 MEDIO | `src/app/api/portal/guardia/chat/.../route.ts:308-318` y `.../cliente/.../route.ts:308-318` |
| 3 | **Rutas guardia/cliente no pasan `imageUrl`** → No se muestra imagen en push desde portales | 🟢 BAJO | Mismos archivos |
| 4 | **`calculateBadgeCount()` N+1** — 2-3 queries por recipient | 🟡 MEDIO | `src/lib/pwa/push-service.ts:62-102` |
| 5 | **URL de click para guardias de Rondas** apunta a portal incorrecto | 🟡 MEDIO | `src/lib/pwa/push-service.ts:370-374` |

### 3. Timeline de Latencia

```
ACTUAL (estimado):
  Server-side: 250-600ms (10 queries base + N×3 badge queries + N×M web push calls)
  Push delivery: 500-5000ms (depende del OS/provider)
  TOTAL: 1-6 segundos

CON OPTIMIZACIONES:
  Server-side: 100-200ms (queries paralelas + badge batch + waitUntil)
  Push delivery: 500-5000ms (no controlable)
  TOTAL: 0.6-5.2 segundos
```

### 4. Plan de Acción Priorizado

#### Prioridad 1: Asegurar que las push siempre se envíen (🔴 CRÍTICO)

**Problema:** Sin `waitUntil()`, Vercel puede matar el proceso antes de enviar las push.

**Solución:** En cada API route de chat messages, usar `waitUntil()` de Next.js:

```typescript
// En route.ts de messages:
import { after } from 'next/server';

// Dentro del POST handler, después de construir la respuesta:
after(async () => {
  await sendChatPushNotifications({...});
});
```

**Archivos a modificar:**
- `src/app/api/chat/channels/[id]/messages/route.ts`
- `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts`
- `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts`

**Ahorro estimado:** Elimina la pérdida silenciosa del 10-50% de las push notifications.

#### Prioridad 2: Batch calculateBadgeCount (🟡 ALTO)

**Problema:** 2-3 queries por recipient para calcular badges.

**Solución:** Pre-calcular badge counts para todos los recipients en una sola query batch, antes del `Promise.allSettled` de recipients.

**Archivo:** `src/lib/pwa/push-service.ts:465-493`

**Ahorro estimado:** De N×(2-3) queries a 2-3 queries totales. Con 10 recipients: de ~30 queries a ~3 queries (~100ms ahorrados).

#### Prioridad 3: Pasar mentionedUserIds desde portales (🟡 MEDIO)

**Problema:** Las rutas de guardia y cliente no pasan menciones.

**Solución:** Extraer mentionedUserIds del contenido del mensaje igual que la ruta admin.

**Archivos:**
- `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts`
- `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts`

#### Prioridad 4: Corregir URL de click para Portal Rondas (🟡 MEDIO)

**Problema:** Guardias que usan Rondas reciben link a `/portal/guardia`.

**Solución:** Almacenar el `portalType` en la tabla `push_subscriptions` y usarlo para generar la URL correcta. O bien, usar una heurística basada en el path del subscription (si la suscripción se hizo desde rondas, generar URL de rondas).

**Archivo:** `src/lib/pwa/push-service.ts:370-374` y schema de push_subscriptions

#### Prioridad 5: Limpieza de suscripciones inactivas (🟢 BAJO)

**Problema:** Las suscripciones con `isActive: false` se acumulan indefinidamente.

**Solución:** Cron job o script que elimine suscripciones inactivas con más de 30 días.

---

## Resumen Ejecutivo

**¿Por qué las push no llegan a todas las PWAs?**

1. **Portal Acceso no tiene push** — Pero tampoco tiene chat, así que no es un problema real.
2. **Las push SÍ se configuran correctamente** en las otras 5 PWAs (OPAI, Clientes, Guardias, Supervisores, Rondas).
3. **El problema principal de push que no llegan es `waitUntil()`** — Sin él, Vercel puede matar el proceso serverless antes de que se envíen las notificaciones.

**¿Por qué las push se sienten lentas?**

1. **`calculateBadgeCount()` hace demasiadas queries** — Es el bottleneck principal dentro del servidor.
2. **No hay warmup del proceso serverless** — Cold starts en Vercel añaden 200-500ms.
3. **La entrega por parte de Apple/Google** puede tardar segundos adicionales (fuera de nuestro control).
