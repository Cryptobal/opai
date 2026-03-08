const CACHE_NAME = 'opai-v2';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/portal/cliente',
  '/portal/guardia',
  '/portal/rondas',
  '/opai/login',
  OFFLINE_URL,
];

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

  // Navigation: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
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
    // Always show a notification to satisfy the browser requirement
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

  const promiseChain = self.registration.showNotification(title, {
    body,
    icon: icon || '/iconos_azul/icon-192x192.png',
    badge: badge || '/iconos_azul/icon-192x192.png',
    image,
    tag,
    renotify: !!tag,
    data: notifData,
    vibrate: [200, 100, 200],
    actions: notifData?.actions || [],
  });

  // Badge API: set unread count
  if (navigator.setAppBadge) {
    const count = notifData?.badgeCount || 1;
    promiseChain.then(() => navigator.setAppBadge(count)).catch(() => {});
  }

  event.waitUntil(promiseChain);
});

// NOTIFICATION CLICK
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear badge on click
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
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
        // Try to reuse an existing window from the same origin
        for (const client of clients) {
          if (new URL(client.url).origin === target.origin) {
            return client.navigate(target.href).then(() => client.focus());
          }
        }
        return self.clients.openWindow(target.href);
      })
  );
});

// PUSH SUBSCRIPTION CHANGE: re-subscribe automatically when the browser
// rotates the push subscription (e.g. after expiration).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options || { userVisibleOnly: true })
      .then((newSub) =>
        fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            oldEndpoint: event.oldSubscription?.endpoint,
          }),
        })
      )
      .catch((err) => console.error('[SW] pushsubscriptionchange failed:', err))
  );
});

// SKIP WAITING message
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
