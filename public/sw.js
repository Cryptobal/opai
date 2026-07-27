// v15 (2026-07-27): fix PWA iPhone ERP — pantalla negra→blanca al abrir.
// Causas: (1) al 404 de chunks solo se purgaba HTML de portales/login, NO
// /hub (start_url del ERP); (2) timeout de navigate 3s servía HTML stale
// en cold starts; (3) rutas autenticadas del ERP no deberían caer a HTML
// cacheado. Ahora: purga TODO HTML same-origin ante chunk 404, timeout 8s,
// y rutas ERP hacen network-only (solo offline.html de fallback).
//
// v14 (2026-07-23): bumped tras el pulido minimalista del inicio móvil del
// Hub. Purga HTML/chunks v13.
//
// v13–v6: ver historial git. v6 introdujo el refresh de HTML en navigate
// ante chunks 404 de Vercel (ChunkLoadError → "Algo salió mal").
const CACHE_NAME = 'opai-v15';

// Prefijos de la app ERP autenticada. Cachear su HTML en el SW es peligroso:
// tras un deploy, el shell apunta a chunks ya borrados y iOS PWA queda en
// blanco (start_url=/hub). Portales públicos sí se benefician del cache.
const ERP_APP_PREFIXES = [
  '/hub',
  '/crm',
  '/cpq',
  '/ops',
  '/personas',
  '/payroll',
  '/finanzas',
  '/opai/',
  '/chat',
  '/fiscalizacion',
  '/reportes',
  '/portales',
  '/te',
];

function isErpAppPath(pathname) {
  if (pathname === '/opai' || pathname === '/opai/') return true;
  // /opai/login se precachea a propósito (shell de auth).
  if (pathname === '/opai/login' || pathname.startsWith('/opai/login/')) {
    return false;
  }
  return ERP_APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/')
  );
}

/** Borra todo documento HTML same-origin de la cache (navegaciones). */
function purgeCachedNavigations(cache) {
  return cache.keys().then((reqs) =>
    Promise.all(
      reqs
        .filter((r) => {
          try {
            const u = new URL(r.url);
            if (u.origin !== self.location.origin) return false;
            // Conservar offline.html y el contexto de push.
            if (u.pathname === OFFLINE_URL || u.pathname === '/_push-context') {
              return false;
            }
            const accept = r.headers.get('Accept') || '';
            const dest = r.destination;
            return (
              dest === 'document' ||
              accept.includes('text/html') ||
              u.pathname === '/' ||
              u.pathname.startsWith('/portal/') ||
              u.pathname.startsWith('/hub') ||
              u.pathname.startsWith('/crm') ||
              u.pathname.startsWith('/ops') ||
              u.pathname.startsWith('/finanzas') ||
              u.pathname.startsWith('/personas') ||
              u.pathname.startsWith('/payroll') ||
              u.pathname.startsWith('/opai') ||
              u.pathname.startsWith('/chat') ||
              u.pathname.startsWith('/cpq') ||
              u.pathname.startsWith('/reportes') ||
              u.pathname.startsWith('/portales') ||
              u.pathname.startsWith('/fiscalizacion')
            );
          } catch {
            return false;
          }
        })
        .map((r) => cache.delete(r))
    )
  );
}

// Endpoints de autenticación/sesión que NUNCA deben pasar por la cache del
// SW. Si una respuesta antigua quedara cacheada, el cliente podría ver una
// sesión fantasma (o un 401 falso) cuando reabre el PWA — especialmente en
// iOS standalone, donde el primer fetch al volver a abrir la app es
// exactamente la verificación de sesión.
const AUTH_BYPASS_PATTERNS = [
  '/api/portal/cliente/auth',
  '/api/portal/cliente/logout',
  '/api/portal/guardia/auth',
  '/api/portal/guardia/logout',
  '/api/auth/',
];
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/portal/cliente',
  '/portal/guardia',
  '/portal/rondas',
  '/portal/acceso',
  '/portal/marcacion',
  '/opai/login',
  OFFLINE_URL,
];

// Notification grouping: track message counts per tag
const tagCounts = new Map();

// INSTALL: pre-cache shell (allSettled so individual failures don't abort install)
// NOTE: Do NOT call skipWaiting() here — it causes an infinite update loop.
// skipWaiting is triggered by the SKIP_WAITING message from the update banner.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
});

// ACTIVATE: remove old caches (including legacy rondas-v1)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== 'push-context').map((k) => caches.delete(k))
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

  // AI chat routes: always bypass SW (SSE streaming is incompatible with SW caching)
  if (url.pathname.startsWith('/api/ai/') || url.pathname.startsWith('/api/marketing/chat')) {
    return; // Let the browser handle these directly
  }

  // Auth/session endpoints: bypass SW completely. La cookie de sesión la
  // gestiona el navegador directamente; cualquier respuesta cacheada acá
  // genera estados inconsistentes (ej. login que "se pierde" al reabrir
  // el PWA en iOS).
  if (AUTH_BYPASS_PATTERNS.some((p) => url.pathname.startsWith(p))) {
    return; // Let the browser handle directly (no SW intervention)
  }

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

  // Static assets: cache-first.
  // Safety net: si un chunk de `/_next/static/chunks/*` viene 404 (Vercel
  // ya borró los chunks de un deploy viejo), invalidamos TODA la cache de
  // navigation (incluido /hub del ERP) para que el próximo refresh sirva
  // HTML fresco. Antes solo se purgaban portales + login → PWA ERP iOS
  // quedaba atrapada en blanco.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (
              !response.ok &&
              response.status === 404 &&
              url.pathname.startsWith('/_next/static/chunks/')
            ) {
              caches.open(CACHE_NAME).then((cache) =>
                purgeCachedNavigations(cache)
              ).catch(() => {});
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigation: network-first.
  // iOS PWA can bail out of standalone mode if a navigation hangs, so we
  // proactively fall back rather than letting the request stall.
  //
  // ERP autenticado (/hub, /crm, …): NUNCA servir HTML cacheado — el shell
  // stale + chunks 404 es la causa de "negro → blanco" en iPhone. Solo
  // offline.html de fallback. Timeout 8s (cold start Vercel + auth/DB).
  //
  // Portales / login: sí cacheamos HTML (útil offline) y timeout 5s.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const erp = isErpAppPath(url.pathname);
      const offlineFallback = () =>
        caches.match(OFFLINE_URL).then((offline) =>
          offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        );
      const cacheFallback = () =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return offlineFallback();
        });
      try {
        const controller = new AbortController();
        const timeoutMs = erp ? 8000 : 5000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        // Solo cachear HTML de portales/login — nunca del ERP autenticado.
        if (
          !erp &&
          response &&
          response.ok &&
          response.type === 'basic'
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      } catch (_) {
        return erp ? offlineFallback() : cacheFallback();
      }
    })());
    return;
  }

  // Default: network with fallback
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) =>
        cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      )
    )
  );
});

// === PUSH NOTIFICATIONS (Prompt 2 — enriched) ===
self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('OPAI', {
        body: 'Tienes una nueva notificacion',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/favicon-48x48.png',
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

  // Badge-only sync: update badge without showing a notification
  if (data.data?.type === 'badge_sync') {
    const bc = data.data.badgeCount;
    event.waitUntil(
      (bc > 0 && navigator.setAppBadge
        ? navigator.setAppBadge(bc)
        : navigator.clearAppBadge
          ? navigator.clearAppBadge()
          : Promise.resolve()
      ).catch(() => {})
    );
    return;
  }

  const {
    title = 'OPAI',
    body = '',
    icon,
    badge,
    tag,
    image,
    renotify,
    silent,
    timestamp,
    data: notifData,
  } = data;

  // Notification grouping: track counts per tag for multi-message display
  let displayBody = body;
  if (tag && tag.startsWith('chat-')) {
    const count = (tagCounts.get(tag) || 0) + 1;
    tagCounts.set(tag, count);
    if (count > 1) {
      const channelName = notifData?.channelName || 'Chat';
      displayBody = `${count} mensajes nuevos en ${channelName}`;
    }
  }

  // Panic alerts get aggressive vibration and persistent display
  const isPanicNotif = title && (title.includes('\uD83C\uDE9A') || title.includes('🆘') || title.includes('PÁNICO') || title.includes('PANICO'));

  // Alerta de cobertura: urgent notifications with require interaction
  const isAlertaCobertura = notifData?.type === 'alerta_cobertura' || (tag && tag.startsWith('alerta-cobertura-'));

  const options = {
    body: displayBody,
    icon: icon || '/icons/icon-192x192.png',
    badge: badge || '/icons/favicon-48x48.png',
    image: image || undefined,
    tag: tag || undefined,
    renotify: renotify !== undefined ? renotify : !!tag,
    silent: silent || false,
    timestamp: timestamp || Date.now(),
    data: notifData,
    vibrate: isPanicNotif ? [500, 200, 500, 200, 500, 200, 500] : isAlertaCobertura ? [300, 100, 300] : [200, 100, 200],
    requireInteraction: isPanicNotif || isAlertaCobertura ? true : undefined,
    actions: data.actions || undefined,
  };

  // Notify open clients for in-app toast (Prompt 3)
  // The client decides whether to show the toast based on visibility/active channel
  const clientNotify = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        client.postMessage({
          type: isPanicNotif ? 'PANIC_PUSH' : 'PUSH_RECEIVED',
          title,
          body: displayBody,
          data: notifData,
          tag,
          timestamp: timestamp || Date.now(),
        });
      }
    })
    .catch(() => {});

  // Notify any open clients so useBadgeSync re-fetches the real per-user count
  // from /api/badge/count instead of trusting the value embedded in the payload.
  const promiseChain = self.registration.showNotification(title, options)
    .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .then((openClients) => {
      for (const client of openClients) {
        client.postMessage({ type: 'BADGE_SYNC' });
      }
    })
    .catch(() => {});

  event.waitUntil(Promise.all([promiseChain, clientNotify]));
});

// === NOTIFICATION CLICK (Prompt 2 — enriched) ===
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const tag = event.notification.tag;

  // Reset tag count on click
  if (tag) {
    tagCounts.delete(tag);
  }

  // Clear badge on click
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  // Handle action clicks
  if (event.action === 'dismiss') {
    return; // Just close, don't navigate
  }

  // Alerta de cobertura: "aceptar" action — navigate to acceptance page
  if (event.action === 'aceptar' && event.notification.data?.type === 'alerta_cobertura') {
    const alertaUrl = event.notification.data?.url || '/portal/guardia/alertas';
    const target = new URL(alertaUrl, self.location.origin);
    event.waitUntil(self.clients.openWindow(target.href));
    return;
  }

  // Mark notification as read if notificationId is present
  const notificationId = event.notification.data?.notificationId;
  if (notificationId) {
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notificationId, read: true }),
    }).catch(() => {});
  }

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

// PUSH SUBSCRIPTION CHANGE: re-subscribe automatically
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.pushManager
        .subscribe(event.oldSubscription?.options || { userVisibleOnly: true }),
      caches.open('push-context')
        .then((cache) => cache.match('/_push-context'))
        .then((res) => res ? res.json() : null)
        .catch(() => null),
    ])
      .then(([newSub, ctx]) => {
        if (!ctx) {
          console.warn('[SW] pushsubscriptionchange: no stored context, cannot re-subscribe');
          return;
        }
        return fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            portalType: ctx.portalType,
            userType: ctx.userType,
            userId: ctx.userId,
            tenantId: ctx.tenantId,
          }),
        });
      })
      .catch((err) => console.error('[SW] pushsubscriptionchange failed:', err))
  );
});

// Message handlers
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Store push subscription context for pushsubscriptionchange re-subscribe
  if (event.data?.type === 'STORE_PUSH_CONTEXT') {
    const ctx = event.data.context;
    if (ctx) {
      caches.open('push-context').then((cache) => {
        cache.put('/_push-context', new Response(JSON.stringify(ctx)));
      });
    }
  }

  // Dismiss all panic push notifications (cross-device alarm stop)
  if (event.data?.type === 'DISMISS_PANIC') {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => {
        const title = notification.title || '';
        if (
          notification.tag?.includes('panic') ||
          title.includes('P\u00c1NICO') ||
          title.includes('PANICO') ||
          title.includes('\uD83C\uDE9A') ||
          title.includes('\uD83C\uDD98')
        ) {
          notification.close();
        }
      });
    });
  }
});
