const CACHE_NAME = "rondas-v1";
const STATIC_ASSETS = [
  "/portal/rondas",
  "/portal-rondas-manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network-first with offline fallback
  if (url.pathname.startsWith("/api/portal/rondas/")) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
        .then((response) => response || new Response(JSON.stringify({ success: false, error: "Sin conexion" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }))
    );
    return;
  }

  // Static portal assets: cache-first with put-on-miss
  // Other requests (third-party scripts, fonts, etc.) use default browser behavior
  if (url.pathname.startsWith("/portal/rondas")) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone))
            .catch((err) => console.error("[Rondas SW] Cache write failed:", err));
          return response;
        })
      )
    );
  }
});
