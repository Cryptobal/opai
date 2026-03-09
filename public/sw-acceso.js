/**
 * Service Worker — Portal Control de Acceso
 * Strategy: Network-first for data, Cache-first for static assets
 */

const CACHE_NAME = "acceso-v1";
const DATA_CACHE = "acceso-data-v1";

const STATIC_ASSETS = [
  "/portal/acceso",
  "/manifest-acceso.json",
  "/iconos_azul/icon-192x192.png",
  "/iconos_azul/icon-512x512.png",
];

// Notification grouping
const tagCounts = new Map();

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network-first for API, Cache-first for assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: network-first
  if (url.pathname.startsWith("/api/access-control")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/portal/acceso") ||
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/iconos_azul")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// === PUSH NOTIFICATIONS ===
self.addEventListener("push", (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification("Control de Acceso", {
        body: "Tienes una nueva notificacion",
        icon: "/iconos_azul/icon-192x192.png",
        badge: "/iconos_azul/icon-72x72.png",
      })
    );
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Control de Acceso", body: event.data.text() || "Nueva notificacion" };
  }

  const {
    title = "Control de Acceso",
    body = "",
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
  if (tag && tag.startsWith("chat-")) {
    const count = (tagCounts.get(tag) || 0) + 1;
    tagCounts.set(tag, count);
    if (count > 1) {
      const channelName = notifData?.channelName || "Chat";
      displayBody = `${count} mensajes nuevos en ${channelName}`;
    }
  }

  const options = {
    body: displayBody,
    icon: icon || "/iconos_azul/icon-192x192.png",
    badge: badge || "/iconos_azul/icon-72x72.png",
    image: image || undefined,
    tag: tag || undefined,
    renotify: renotify !== undefined ? renotify : !!tag,
    silent: silent || false,
    timestamp: timestamp || Date.now(),
    data: notifData,
    vibrate: [200, 100, 200],
  };

  // Notify open clients for in-app toast
  const clientNotify = self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        client.postMessage({
          type: "PUSH_RECEIVED",
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
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const tag = event.notification.tag;
  if (tag) tagCounts.delete(tag);

  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  if (event.action === "dismiss") return;

  const notificationId = event.notification.data?.notificationId;
  if (notificationId) {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notificationId, read: true }),
    }).catch(() => {});
  }

  const targetUrl = event.notification.data?.url || "/portal/acceso";
  const target = new URL(targetUrl, self.location.origin);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
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
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options || { userVisibleOnly: true })
      .then((newSub) =>
        fetch("/api/notifications/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            oldEndpoint: event.oldSubscription?.endpoint,
          }),
        })
      )
      .catch((err) => console.error("[SW-Acceso] pushsubscriptionchange failed:", err))
  );
});

// SKIP WAITING message
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
