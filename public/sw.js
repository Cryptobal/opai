const CACHE_NAME = 'opai-v3';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/portal/cliente',
  '/portal/guardia',
  '/portal/rondas',
  '/portal/supervisor',
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
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Navigation: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return caches.match(OFFLINE_URL).then((offline) =>
            offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        })
      )
    );
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

  const promiseChain = self.registration.showNotification(title, options)
    .then(() => {
      // Set real badge count from payload
      if (navigator.setAppBadge && notifData?.badgeCount) {
        return navigator.setAppBadge(notifData.badgeCount);
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
