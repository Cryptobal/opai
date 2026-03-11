// Legacy SW — replaced by unified /sw.js
// Auto-unregisters and refreshes clients to pick up the new SW.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  self.registration.unregister();
  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.navigate(c.url))
  );
});
