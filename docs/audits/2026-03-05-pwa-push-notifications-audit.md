# Auditoría PWA + Push Notifications — OPAI

**Fecha:** 2026-03-05
**Proyecto:** OPAI (Next.js 15, App Router)
**Dominio:** opai.gard.cl
**Dispositivo de prueba reportado:** iPhone 17 Pro Max (Safari, Chrome, Arc)

---

## 1. ARCHIVOS ENCONTRADOS

### Manifests
- `/public/manifest.json` (app principal)
- `/public/manifest-guardia.json` (portal guardia)
- `/public/manifest-cliente.json` (portal cliente)
- `/public/manifest-supervisor.json` (portal supervisor)
- `/public/portal-rondas-manifest.json` (portal rondas)

### Service Workers
- `/public/sw.js` (SW unificado — principal)
- `/public/rondas-sw.js` (legacy, siendo eliminado)
- `/public/sw-cliente.js` (legacy, siendo eliminado)

### Registro de SW
- `/src/lib/pwa/register-sw.ts` (función core de registro)
- `/src/lib/pwa/use-service-worker.ts` (hook React)
- `/src/components/portal/rondas/ServiceWorkerRegistrar.tsx` (usado por rondas, guardia, supervisor)
- `/src/components/portal/cliente/PwaRegistrar.tsx` (usado por cliente)
- `/src/components/pwa/PWAProvider.tsx` (wrapper en root layout)

### Push Notification System
- `/src/lib/pwa/push-client.ts` (subscribe/unsubscribe en cliente)
- `/src/lib/pwa/push-service.ts` (envío server-side con web-push)
- `/src/lib/pwa/portal-notification-types.ts` (42 tipos de notificación)
- `/src/components/pwa/PushPermissionPrompt.tsx` (prompt UI)
- `/src/components/pwa/NotificationSettings.tsx` (preferencias por usuario)

### API Routes
- `/src/app/api/notifications/push/subscribe/route.ts` (POST/DELETE suscripción)
- `/src/app/api/notifications/push/preferences/route.ts` (GET/PUT preferencias)
- `/src/app/api/notifications/config/route.ts` (config global por tenant)

### Configuración
- `/next.config.js` (headers para SW)
- `/src/middleware.ts` (rutas públicas para push)
- `/src/lib/pwa/use-install-prompt.ts` (detección de instalación)

### Layouts (referencia a manifests)
- `/src/app/layout.tsx` → `manifest.json`
- `/src/app/portal/guardia/layout.tsx` → `manifest-guardia.json`
- `/src/app/portal/cliente/layout.tsx` → `manifest-cliente.json`
- `/src/app/portal/supervisor/layout.tsx` → `manifest-supervisor.json`
- `/src/app/portal/rondas/layout.tsx` → `portal-rondas-manifest.json`

### Iconos
- `/public/iconos_azul/` — icon-48x48, 72x72, 96x96, 128x128, 144x144, 192x192, 512x512
- `/public/icons/` — mismos tamaños + icon-180x180 (Apple)

---

## 2. CONTENIDO DE CADA ARCHIVO

### `/public/manifest.json`
```json
{
  "name": "OPAI",
  "short_name": "OPAI",
  "description": "ERP Gard Security",
  "start_url": "/hub",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### `/public/manifest-guardia.json`
```json
{
  "name": "OPAI Guardias",
  "short_name": "OPAI Guardias",
  "description": "Portal de guardias — Gard Security",
  "start_url": "/portal/guardia",
  "scope": "/portal/guardia",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### `/public/manifest-cliente.json`
```json
{
  "name": "OPAI Clientes",
  "short_name": "OPAI Clientes",
  "description": "Portal de clientes — Gard Security",
  "start_url": "/portal/cliente",
  "scope": "/portal/cliente",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### `/public/manifest-supervisor.json`
```json
{
  "name": "OPAI Supervisor",
  "short_name": "OPAI Supervisor",
  "description": "Portal de supervisores — Gard Security",
  "start_url": "/portal/supervisor",
  "scope": "/portal/supervisor",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### `/public/portal-rondas-manifest.json`
```json
{
  "name": "OPAI Rondas",
  "short_name": "OPAI Rondas",
  "description": "Portal de rondas — Gard Security",
  "start_url": "/portal/rondas",
  "scope": "/portal/rondas",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-48x48.png",   "sizes": "48x48",   "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-72x72.png",   "sizes": "72x72",   "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-96x96.png",   "sizes": "96x96",   "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-128x128.png", "sizes": "128x128", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-144x144.png", "sizes": "144x144", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### `/public/sw.js`
```js
const CACHE_NAME = 'opai-v1';

const PRECACHE_URLS = [
  '/portal/cliente',
  '/portal/guardia',
  '/portal/rondas',
  '/opai/login',
];

// INSTALL: pre-cache shell (allSettled so individual failures don't abort install)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// ACTIVATE: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// FETCH: strategy by resource type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // API: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/iconos_azul/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Navigation: network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Default: network with fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// PUSH NOTIFICATIONS
self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('OPAI', {
        body: 'Tienes una nueva notificacion',
        icon: '/iconos_azul/icon-192x192.png',
        badge: '/iconos_azul/icon-192x192.png',
      })
    );
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'OPAI', body: event.data.text() || 'Nueva notificacion' };
  }

  const {
    title = 'OPAI',
    body = '',
    icon,
    badge,
    tag,
    image,
    data: notifData,
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/iconos_azul/icon-192x192.png',
      badge: badge || '/iconos_azul/icon-192x192.png',
      image,
      tag,
      renotify: !!tag,
      data: notifData,
      vibrate: [200, 100, 200],
      actions: notifData?.actions || [],
    })
  );
});

// NOTIFICATION CLICK
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  if (event.action) {
    const actionUrl = event.notification.data?.actionUrls?.[event.action];
    if (actionUrl) {
      event.waitUntil(self.clients.openWindow(actionUrl));
      return;
    }
  }

  const target = new URL(targetUrl, self.location.origin);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === target.origin) {
            return client.navigate(target.href).then(() => client.focus());
          }
        }
        return self.clients.openWindow(target.href);
      })
  );
});

// SKIP WAITING message
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

### `/src/lib/pwa/register-sw.ts`
```ts
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('sw-updated'));
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}
```

### `/src/lib/pwa/push-client.ts`
```ts
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}

export async function subscribeToPush(params: {
  registration: ServiceWorkerRegistration;
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
}): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const subscription = await params.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        portalType: params.portalType,
        userType: params.userType,
        userId: params.userId,
        tenantId: params.tenantId,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error('[push] Subscription failed:', error);
    return false;
  }
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    if (!res.ok) {
      console.warn('[push] Server unsubscribe failed:', res.status);
    }

    await subscription.unsubscribe();
    return true;
  } catch (error) {
    console.error('[push] Unsubscribe failed:', error);
    return false;
  }
}
```

### `/src/lib/pwa/push-service.ts`
```ts
import webPush from 'web-push';
import { prisma } from '@/lib/prisma';

let vapidInitialized = false;
function ensureVapidInitialized() {
  if (vapidInitialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('[push] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment');
  }
  webPush.setVapidDetails(
    'mailto:soporte@gardsecurity.cl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidInitialized = true;
}

// ... (globalSettingKey, isGloballyEnabled, toChatSenderType helpers)

export async function sendPushToPortalUser({ tenantId, notifKey, userType, userId, portalType, title, body, url, tag }: SendPushParams) {
  ensureVapidInitialized();
  // 1. Check user-level preferences (portal users only)
  // 1b. Check global config
  // 2. Get active push subscriptions from ChatPushSubscription table
  // 3. Send to each subscription via webPush.sendNotification()
  // Handles 410/404 by marking subscription inactive
}

export async function sendPushToAdmins(tenantId, notifKey, title, body, url?) { /* ... */ }
export async function sendPushToSpecificAdmins(tenantId, adminIds[], notifKey, title, body, url?) { /* ... */ }
export async function sendChatPushNotifications({ tenantId, channelId, channelName, senderType, senderId, senderName, messagePreview }) { /* ... */ }
```

### `/src/components/pwa/PushPermissionPrompt.tsx`
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { subscribeToPush } from '@/lib/pwa/push-client';
import { Bell, X } from 'lucide-react';

interface Props {
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
}

export function PushPermissionPrompt({ portalType, userType, userId, tenantId }: Props) {
  const { registration } = useServiceWorker();
  const [dismissed, setDismissed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-subscribe when permission is already granted
  useEffect(() => {
    if (!registration) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    subscribeToPush({ registration, portalType, userType, userId, tenantId })
      .then((ok) => { if (ok) setSubscribed(true); })
      .catch(() => {});
  }, [registration, portalType, userType, userId, tenantId]);

  if (subscribed || dismissed || !registration) return null;
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return null;

  const handleEnable = async () => { /* requestPermission + subscribe */ };

  return (
    <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-4">
      {/* Bell icon + "Activar notificaciones" + Activar button + X dismiss */}
    </div>
  );
}
```

### `/src/app/api/notifications/push/subscribe/route.ts`
```ts
// POST: upsert ChatPushSubscription, create default PortalNotificationPreference
// DELETE: mark subscription inactive by endpoint
// Auth: Portal routes use PIN-based auth, not NextAuth
```

### `/next.config.js`
```js
const nextConfig = {
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  eslint: { ignoreDuringBuilds: true },
  images: { formats: ["image/avif", "image/webp"], /* ... */ },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/rondas-sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
```

### `/src/middleware.ts` (extracto relevante)
```ts
// Push subscription & preferences — portal users authenticate via PIN, not NextAuth
if (pathname.startsWith('/api/notifications/push/subscribe')) return true;
if (pathname.startsWith('/api/notifications/push/preferences')) return true;
```

---

## 3. HALLAZGOS POR FASE

### FASE 1: Inventario de archivos PWA
- **5 manifests** encontrados (1 principal + 4 portales)
- **3 service workers** en `/public/` (1 unificado + 2 legacy)
- Sistema completo de push: cliente, servidor, API routes, preferencias, DB
- **42 tipos de notificación** definidos con defaults push/email
- Push integrado en: chat, tickets, rondas, documentos, CRM leads, CPQ, cron alerts

### FASE 2: Análisis del Manifest

| Propiedad | manifest.json | guardia | cliente | supervisor | rondas |
|-----------|:---:|:---:|:---:|:---:|:---:|
| `display: standalone` | OK | OK | OK | OK | OK |
| `start_url` correcto | `/hub` | `/portal/guardia` | `/portal/cliente` | `/portal/supervisor` | `/portal/rondas` |
| Icon 192x192 | OK | OK | OK | OK | OK |
| Icon 512x512 | OK | OK | OK | OK | OK |
| `purpose: maskable` | OK | OK | OK | OK | OK |
| `scope` definido | `/` | `/portal/guardia` | `/portal/cliente` | `/portal/supervisor` | `/portal/rondas` |
| `id` definido | **NO** | **NO** | **NO** | **NO** | **NO** |
| Referenciado en layout | OK | OK | OK | OK | OK |

**Problemas encontrados:**
1. **`purpose: "any maskable"` está DEPRECATED** — Chrome ya no acepta ambos valores combinados. Se debe usar DOS entradas de ícono separadas: una con `"purpose": "any"` y otra con `"purpose": "maskable"`.
2. **Falta `id` en todos los manifests** — sin `id`, el browser usa `start_url` como identity. Si cambia `start_url`, el usuario podría instalar una segunda instancia.
3. **Falta apple-touch-icon de 180x180** — El root layout usa `icon-192x192.png` con `sizes: "180x180"`, lo cual es una mentira (el archivo real es 192x192). Los portal layouts no definen apple icons de 180x180.

### FASE 3: Análisis del Service Worker

1. **Existe:** `/public/sw.js` — archivo estático, no generado en build
2. **Registro:**
   - Root layout → `PWAProvider` → `useServiceWorker` → `registerServiceWorker('/sw.js', { scope: '/' })`
   - Cada portal layout tiene su propio registrador que primero limpia SWs legacy
3. **Event listeners presentes:**
   - `install` — OK
   - `activate` — OK (con `clients.claim()`)
   - `fetch` — OK (network-first API, cache-first static, network-first navigation)
   - `push` — OK (parsea JSON, muestra notificación)
   - `notificationclick` — OK (navega a URL, reusa ventana existente)
   - **`pushsubscriptionchange` — AUSENTE** (PROBLEMA)
4. **Framework:** Custom (no usa Workbox, Serwist, ni next-pwa)
5. **Scope:** `/` (correcto, cubre todos los portales)
6. **Ubicación:** `/public/sw.js` (estático)

### FASE 4: Análisis del flujo de Push Notifications

#### 4.1 PERMISOS
- `Notification.requestPermission()` se llama en `push-client.ts:subscribeToPush()`
- Se invoca cuando el usuario toca "Activar" en `PushPermissionPrompt`
- Sí verifica `typeof Notification === 'undefined'`
- Sí maneja permiso `denied` (retorna false)
- **El prompt se muestra solo cuando `Notification.permission === 'default'`** — correcto

#### 4.2 SUSCRIPCIÓN PUSH
- Se llama `registration.pushManager.subscribe()` con `{ userVisibleOnly: true, applicationServerKey }`
- Usa VAPID con clave pública de `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Se envía al backend: `POST /api/notifications/push/subscribe`
- Se guarda en BD: tabla `ChatPushSubscription` (endpoint unique, p256dh, auth)
- Se crean preferencias por defecto en `PortalNotificationPreference`

#### 4.3 BACKEND — ENVÍO
- Endpoint de envío: **NO hay un endpoint API expuesto para enviar push manualmente**. El envío se hace internamente desde otros API routes.
- Usa `web-push` (npm) con VAPID
- Variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server-side) + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client-side)
- **Las VAPID keys NO están documentadas en `.env.example`** (PROBLEMA CRÍTICO)
- Integración con chat: Sí, `sendChatPushNotifications()` se llama desde las API routes de mensajes de chat
- Integración con tickets, rondas, documentos, CRM: Sí, varias API routes llaman `sendPushToPortalUser()` / `sendPushToAdmins()`

#### 4.4 RECEPCIÓN EN SW
- El `push` event parsea JSON correctamente con fallback a texto
- Llama `self.registration.showNotification()` con: title, body, icon, badge, image, tag, renotify, data, vibrate, actions
- `notificationclick` navega a `event.notification.data?.url` o `/`
- Soporta acciones custom via `data.actionUrls[action]`

### FASE 5: Análisis específico para iOS/Safari

1. **Meta tags de Apple:**
   - `apple-mobile-web-app-capable: true` — presente en todos los layouts via `appleWebApp.capable`
   - `apple-mobile-web-app-status-bar-style: black-translucent` — presente en todos
   - `apple-touch-icon` — presente en root layout (192x192 etiquetado como 180x180), portal layouts solo usan 192x192

2. **Compatibilidad iOS para push:**
   - **NO se verifica que el usuario esté en modo standalone (PWA instalada) antes de pedir push** (PROBLEMA CRÍTICO PARA iOS)
   - iOS Safari SOLO permite Push API cuando la app está instalada en home screen (desde iOS 16.4+)
   - `useInstallPrompt.ts` detecta standalone pero NO se usa para condicionar el prompt de push
   - **NO hay guía al usuario para instalar primero la PWA en iOS antes de activar push**

3. **Manejo del caso especial iOS:**
   - `PushPermissionPrompt` NO verifica si está en modo standalone
   - Si el usuario abre opai.gard.cl en Safari (sin instalar), el prompt de push se muestra pero `Notification.requestPermission()` **fallará silenciosamente** o lanzará un error no manejado
   - **NO hay detección de `(navigator as any).standalone` en PushPermissionPrompt**

4. **Iconos de Apple:**
   - **NO hay `apple-touch-icon` real de 180x180** — se usa `icon-192x192.png` con el tamaño "mentido" como 180x180
   - `/public/icons/icon-180x180.png` existe pero NO se referencia en ningún layout
   - **NO hay apple-splash-screen** para ningún dispositivo

### FASE 6: Verificación de dependencias

#### package.json
- `web-push: ^3.6.7` — OK, instalado
- `@types/web-push: ^3.6.4` — OK
- **NO** usa `next-pwa`, `@serwist/next`, `workbox-*`, `firebase`, `firebase-admin`
- `pusher: ^5.3.2` y `pusher-js: ^8.4.0` — para real-time messaging (complementario, no conflicto)

#### Compatibilidad Next.js 15 + App Router
- No usa plugins PWA (next-pwa, serwist) → no hay problema de compatibilidad
- SW custom es compatible con App Router

#### Variables de entorno
- `.env.example` **NO contiene** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Esto significa que cualquier nuevo developer o deploy que se haga basándose en `.env.example` **no tendrá push notifications funcionando**

### FASE 7: Verificación de Next.js Config

1. **Headers SW:** Correctamente configurados — `Service-Worker-Allowed: /` y `Cache-Control: max-age=0, must-revalidate`
2. **Rewrites/redirects:** No hay rewrites ni redirects que interfieran
3. **Middleware:** El matcher excluye archivos estáticos (`.png`, `.ico`, etc.) pero NO excluye explícitamente `/sw.js`. Sin embargo, `sw.js` no matchea rutas protegidas (no empieza con `/opai/`), así que no hay problema.
4. **CSP:** No hay Content-Security-Policy configurado — no bloquea notificaciones
5. **output: standalone:** No se usa `output: 'standalone'` — no hay problema de copia del SW

### FASE 8: Diagnóstico de problemas comunes

1. **¿El SW se registra correctamente?** — Sí, la lógica es sólida. El root layout registra vía `PWAProvider` y cada portal layout registra limpiando SWs legacy primero.

2. **¿La suscripción push se crea y envía al servidor?** — La lógica es correcta PERO depende de que `NEXT_PUBLIC_VAPID_PUBLIC_KEY` esté configurada. Si no está, `subscribeToPush()` retorna `false` silenciosamente con solo un `console.error`.

3. **¿El servidor puede enviar notificaciones?** — Depende de que `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` estén en el environment. Si no están, `ensureVapidInitialized()` lanzará un error y el push fallará.

4. **¿El SW recibe el evento push?** — Sí, el handler es correcto y parsea JSON con fallback.

5. **¿Hay código muerto?** — Los SW legacy (`rondas-sw.js`, `sw-cliente.js`) siguen en `/public/` pero ya no se registran activamente. Son código muerto.

6. **¿Hay implementaciones conflictivas?** — No hay conflicto. Los registradores de cada portal limpian SWs legacy antes de registrar el unificado.

7. **¿El chat tiene integración con push?** — Sí, `sendChatPushNotifications()` se llama desde las rutas de mensajes. Resuelve destinatarios por canal (INSTALLATION, GROUP, DIRECT) y respeta preferencias per-channel.

8. **¿Hay sistema de preferencias por usuario?** — Sí, completo: `PortalNotificationPreference` (por tipo de notif, push/email), `ChatNotificationPreference` (per-channel: ALL, MENTIONS_ONLY, MUTED), y config global por tenant.

9. **¿Se generaron las VAPID keys?** — **IMPOSIBLE VERIFICAR** — no están documentadas en `.env.example` ni en ningún archivo del repo. Si no están en Vercel, push no funciona.

10. **¿El SW scope cubre todos los portales?** — Sí, scope es `/` en el SW unificado.

---

## 4. PROBLEMAS IDENTIFICADOS (ordenados por severidad)

### CRÍTICOS (Push no funciona)

**P1. VAPID keys posiblemente no configuradas en producción**
- `.env.example` NO incluye `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, ni `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Si estas variables no están en Vercel, todo el sistema de push está silenciosamente roto
- `push-client.ts:15` retorna `false` si `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no existe
- `push-service.ts:8` lanza Error si `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no existen
- **Acción:** Verificar en Vercel si las 3 variables están configuradas. Si no, generarlas con `web-push generate-vapid-keys`

**P2. Push en iOS falla si la PWA no está instalada**
- iOS Safari solo permite Web Push cuando la app está en modo standalone (Add to Home Screen)
- `PushPermissionPrompt` NO verifica `(navigator as any).standalone` ni `window.matchMedia('(display-mode: standalone)')` antes de mostrar el prompt
- Si un usuario de iOS ve el prompt en el browser (no instalado), al tocar "Activar", `Notification.requestPermission()` fallará o retornará `denied`
- **Archivos afectados:** `src/components/pwa/PushPermissionPrompt.tsx`

**P3. Conflicto de scope en manifests de portales vs SW**
- Los manifests de portales tienen `scope: "/portal/guardia"`, `scope: "/portal/cliente"`, etc.
- El SW se registra con `scope: "/"`
- **Cuando un portal se instala como PWA independiente desde su manifest, el scope del manifest limita la navegación a su sub-ruta**, pero el SW tiene scope `/`
- Esto puede causar que el SW precachee URLs fuera del scope del manifest, confundiendo al browser
- Más importante: **si el usuario instala "OPAI Guardias" y el SW está en scope `/`, la PWA podría interceptar requests de otros portales si el usuario navega fuera**

### ALTOS

**P4. `purpose: "any maskable"` está deprecated**
- Todos los manifests usan `"purpose": "any maskable"` en los iconos
- Chrome 114+ ignora esta combinación y trata el ícono solo como `any`
- El ícono maskable no se aplica en Android, resultando en un ícono circular cortado
- **Fix:** Separar en dos entradas por tamaño, una con `"purpose": "any"` y otra con `"purpose": "maskable"`

**P5. No hay `pushsubscriptionchange` event handler en el SW**
- Si el push server rota sus claves o la suscripción expira, el browser emite `pushsubscriptionchange`
- Sin este handler, la suscripción se pierde silenciosamente y el usuario nunca más recibe pushes
- **Archivo afectado:** `public/sw.js`

**P6. Apple touch icon incorrecto — 192x192 etiquetado como 180x180**
- `src/app/layout.tsx:24` declara `{ url: "/iconos_azul/icon-192x192.png", sizes: "180x180" }`
- El archivo real es 192x192px. iOS espera 180x180 para el apple-touch-icon
- Existe `/public/icons/icon-180x180.png` pero NO se usa en ningún layout
- Los portal layouts solo usan `192x192` sin especificar tamaño 180x180
- **Fix:** Usar `/icons/icon-180x180.png` o crear una copia en `iconos_azul/`

### MEDIOS

**P7. Service Workers legacy en `/public/`**
- `rondas-sw.js` y `sw-cliente.js` ya no se registran pero siguen sirviendo
- Ocupan espacio, confunden a developers, y podrían ser registrados accidentalmente
- **Fix:** Eliminar ambos archivos y remover los headers de `rondas-sw.js` en `next.config.js`

**P8. Falta `id` en todos los manifests**
- Sin `id`, el browser usa `start_url` como identificador de la PWA
- Si `start_url` cambia, se crea una nueva instancia en lugar de actualizar
- **Fix:** Agregar `"id": "/hub"`, `"id": "/portal/guardia"`, etc.

**P9. No hay apple-splash-screen para ningún dispositivo**
- En iOS, sin splash screens, la PWA muestra una pantalla blanca al abrir desde home screen
- Esto afecta la percepción de calidad de la app
- **Fix:** Generar splash screens para los tamaños principales de iPhone/iPad

**P10. No hay fallback offline page**
- El SW usa network-first para navegación con fallback a cache
- Si una página nunca fue visitada y el usuario está offline, no hay fallback
- **Fix:** Agregar una `/offline.html` al precache y servirla como fallback de navegación

**P11. PushPermissionPrompt no persiste el dismiss**
- El dismiss se guarda en estado React (`useState`) — no en localStorage
- Si el usuario recarga la página, el prompt reaparece
- El `PWAInstallBanner` sí usa localStorage con expiración de 7 días, pero el push prompt no
- **Fix:** Persistir dismiss en localStorage con TTL

### BAJOS

**P12. No hay Badge API implementada**
- No se usa `navigator.setAppBadge()` / `navigator.clearAppBadge()`
- El usuario reportó que vio un badge "1" en algún momento — esto podría haber sido el badge del ícono de notificación del OS, no la Badge API de la PWA
- **Fix:** Implementar Badge API en el push handler y al marcar notificaciones como leídas

**P13. Precache de rutas protegidas puede fallar**
- `sw.js` precachea `/portal/cliente`, `/portal/guardia`, `/portal/rondas`, `/opai/login`
- Las rutas de portal pueden requerir autenticación y retornar redirects
- `Promise.allSettled` evita que falle el install, pero las rutas nunca se cachean
- **Fix:** Solo precachear assets estáticos o la offline page

**P14. No hay Content-Security-Policy headers**
- Sin CSP, la app es más vulnerable a XSS que podría abusar de las push notifications
- No es un blocker para push, pero es una mejora de seguridad

---

## 5. ESTADO ACTUAL

| Componente | Estado | Notas |
|---|---|---|
| SW registrado | **SÍ** | `/sw.js` con scope `/`, registrado desde root + portales |
| Manifest correcto | **PARCIAL** | Falta `id`, `purpose` deprecated, icono apple incorrecto |
| VAPID keys configuradas | **DESCONOCIDO** | No están en `.env.example`. Verificar en Vercel |
| Endpoint de suscripción | **SÍ** | `POST /api/notifications/push/subscribe` |
| Endpoint de envío | **SÍ** (interno) | No hay endpoint público; se llama desde otros API routes |
| Event listener `push` en SW | **SÍ** | Con parseo JSON y fallback |
| Event listener `notificationclick` en SW | **SÍ** | Con navegación y acciones |
| Event listener `pushsubscriptionchange` | **NO** | Falta — suscripciones pueden perderse |
| Compatibilidad iOS | **NO** | No verifica standalone antes de pedir push |
| Integración con chat | **SÍ** | Completa con preferencias per-channel |
| Badge API implementada | **NO** | No usa `setAppBadge`/`clearAppBadge` |
| Tabla de suscripciones en BD | **SÍ** | `ChatPushSubscription` con endpoint unique |
| Preferencias por usuario | **SÍ** | `PortalNotificationPreference` + `ChatNotificationPreference` |
| Config global por tenant | **SÍ** | Via `Settings` table |

---

## 6. CÓDIGO QUE NECESITA CAMBIOS

### 6.1 — PushPermissionPrompt: Verificar standalone en iOS

**Archivo:** `src/components/pwa/PushPermissionPrompt.tsx`

El componente debe detectar iOS y solo mostrar el prompt de push si la app está en modo standalone. Si está en Safari sin instalar, debe mostrar un mensaje guiando al usuario a instalar primero.

```tsx
// ACTUAL (línea 32-34):
if (subscribed || dismissed || !registration) return null;
if (typeof Notification === 'undefined') return null;
if (Notification.permission === 'granted' || Notification.permission === 'denied') return null;

// NECESITA AGREGAR:
// Detectar iOS
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || (navigator as any).standalone === true;

// En iOS sin instalar, Push API no está disponible
if (isIOS && !isStandalone) {
  // Mostrar mensaje: "Instala la app primero para recibir notificaciones"
  return <InstallFirstBanner />;
}
```

### 6.2 — sw.js: Agregar pushsubscriptionchange handler

**Archivo:** `public/sw.js`

```js
// AGREGAR después del listener de 'notificationclick':
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then((newSub) => {
        return fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            // Problema: no tenemos userId/tenantId en el SW
            // Opción: enviar oldSubscription.endpoint para que el server haga match
            oldEndpoint: event.oldSubscription?.endpoint,
          }),
        });
      })
  );
});
```
**Nota:** El endpoint `/api/notifications/push/subscribe` necesitaría una variante que acepte `oldEndpoint` para hacer un update en lugar de un create.

### 6.3 — Manifests: Separar purpose de iconos

**Archivos:** Todos los manifests en `/public/`

```json
// ACTUAL:
"icons": [
  { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" }
]

// CORREGIDO:
"icons": [
  { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

### 6.4 — .env.example: Documentar VAPID keys

**Archivo:** `.env.example`

```bash
# AGREGAR sección:
# ─── PUSH NOTIFICATIONS (VAPID) ────────────────────────────────────────────
#
# Claves VAPID para Web Push Notifications (W3C Push API)
# Generar con: npx web-push generate-vapid-keys
# ⚠️ Sin estas variables, las push notifications no funcionarán
#
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=  # Debe ser igual a VAPID_PUBLIC_KEY
```

### 6.5 — Root layout: Corregir apple-touch-icon

**Archivo:** `src/app/layout.tsx`

```tsx
// ACTUAL (línea 24):
{ url: "/iconos_azul/icon-192x192.png", sizes: "180x180", type: "image/png" },

// CORREGIDO:
{ url: "/icons/icon-180x180.png", sizes: "180x180", type: "image/png" },
```

### 6.6 — Manifests: Agregar id

**Todos los manifests:**

```json
// manifest.json
"id": "/hub",

// manifest-guardia.json
"id": "/portal/guardia",

// manifest-cliente.json
"id": "/portal/cliente",

// manifest-supervisor.json
"id": "/portal/supervisor",

// portal-rondas-manifest.json
"id": "/portal/rondas",
```

---

## 7. HIPÓTESIS PRINCIPAL: ¿POR QUÉ DEJARON DE FUNCIONAR LAS PUSH?

Basándome en la auditoría, la causa más probable es una combinación de:

1. **VAPID keys no configuradas en Vercel** — Si las 3 variables de entorno nunca se agregaron (no están en `.env.example`), el sistema nunca pudo enviar push en producción. El "badge 1" que el usuario vio podría haber sido un artefacto del sistema de notificaciones in-app (NotificationBell) y no un push real.

2. **iOS sin modo standalone** — Si el usuario prueba desde Safari sin instalar la PWA, Push API no está disponible en iOS. El prompt se muestra pero `requestPermission()` falla silenciosamente.

3. **Suscripción perdida por falta de `pushsubscriptionchange`** — Si hubo una suscripción válida en algún momento, podría haberse invalidado por rotación de claves del push server sin re-suscripción automática.

**Pasos de verificación inmediatos:**
1. Verificar en Vercel dashboard si `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` están configuradas
2. Verificar en la BD si hay registros en `ChatPushSubscription` con `isActive = true`
3. Probar desde un Android con Chrome instalando la PWA primero
4. En iOS, instalar la PWA (Add to Home Screen) y luego intentar activar notificaciones desde la app instalada
