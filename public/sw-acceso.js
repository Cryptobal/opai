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

// PUSH NOTIFICATIONS
self.addEventListener("push", (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification("Control de Acceso", {
        body: "Tienes una nueva notificacion",
        icon: "/iconos_azul/icon-192x192.png",
        badge: "/iconos_azul/icon-192x192.png",
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
    data: notifData,
  } = data;

  const promiseChain = self.registration.showNotification(title, {
    body,
    icon: icon || "/iconos_azul/icon-192x192.png",
    badge: badge || "/iconos_azul/icon-192x192.png",
    image,
    tag,
    renotify: !!tag,
    data: notifData,
    vibrate: [200, 100, 200],
    actions: notifData?.actions || [],
  });

  if (navigator.setAppBadge) {
    const count = notifData?.badgeCount || 1;
    promiseChain.then(() => navigator.setAppBadge(count)).catch(() => {});
  }

  event.waitUntil(promiseChain);
});

// NOTIFICATION CLICK
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  // Mark notification as read if notificationId is present
  const notificationId = event.notification.data?.notificationId;
  if (notificationId) {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notificationId, read: true }),
    }).catch(() => {});
  }

  const targetUrl = event.notification.data?.url || "/portal/acceso";

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
