/**
 * Service Worker — Portal Clientes
 * NOTE: This legacy SW is being phased out in favor of the unified /sw.js.
 * PwaRegistrar component unregisters this and registers /sw.js instead.
 * These handlers are kept for any clients that still have this SW active
 * until the migration completes.
 */

const CACHE_NAME = 'portal-cliente-v1';
const STATIC_ASSETS = [
  '/portal/cliente',
  '/iconos_azul/icon-192x192.png',
  '/iconos_azul/icon-512x512.png',
];

// Notification grouping
const tagCounts = new Map();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// === PUSH NOTIFICATIONS ===
self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('OPAI Clientes', {
        body: 'Tienes una nueva notificacion',
        icon: '/iconos_azul/icon-192x192.png',
        badge: '/iconos_azul/icon-72x72.png',
      })
    );
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'OPAI Clientes', body: event.data.text() || 'Nueva notificacion' };
  }

  const {
    title = 'OPAI Clientes',
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

  // Notification grouping
  let displayBody = body;
  if (tag && tag.startsWith('chat-')) {
    const count = (tagCounts.get(tag) || 0) + 1;
    tagCounts.set(tag, count);
    if (count > 1) {
      const channelName = notifData?.channelName || 'Chat';
      displayBody = `${count} mensajes nuevos en ${channelName}`;
    }
  }

  const options = {
    body: displayBody,
    icon: icon || '/iconos_azul/icon-192x192.png',
    badge: badge || '/iconos_azul/icon-72x72.png',
    image: image || undefined,
    tag: tag || undefined,
    renotify: renotify !== undefined ? renotify : !!tag,
    silent: silent || false,
    timestamp: timestamp || Date.now(),
    data: notifData,
    vibrate: [200, 100, 200],
  };

  // Notify open clients for in-app toast
  const clientNotify = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        client.postMessage({
          type: 'PUSH_RECEIVED',
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
      if (navigator.setAppBadge && notifData?.badgeCount) {
        return navigator.setAppBadge(notifData.badgeCount);
      }
    })
    .catch(() => {});

  event.waitUntil(Promise.all([promiseChain, clientNotify]));
});

// === NOTIFICATION CLICK ===
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const tag = event.notification.tag;
  if (tag) tagCounts.delete(tag);

  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  if (event.action === 'dismiss') return;

  const notificationId = event.notification.data?.notificationId;
  if (notificationId) {
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notificationId, read: true }),
    }).catch(() => {});
  }

  const targetUrl = event.notification.data?.url || '/portal/cliente';
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

// PUSH SUBSCRIPTION CHANGE
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
      .catch((err) => console.error('[SW-Cliente] pushsubscriptionchange failed:', err))
  );
});

// SKIP WAITING message
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
