const CACHE_NAME = 'opai-v1';

const PRECACHE_URLS = [
  '/portal/cliente',
  '/portal/guardia',
  '/portal/rondas',
  '/opai/login',
];

// INSTALL: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
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
  if (!event.data) return;

  const data = event.data.json();
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

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          const clientPath = new URL(client.url).pathname;
          const targetPath = new URL(targetUrl, self.location.origin).pathname.split('?')[0];
          if (clientPath.startsWith(targetPath)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

// SKIP WAITING message
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
