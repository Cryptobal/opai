export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  // Detect portal scope from URL — keeps PWA isolated per portal
  const portalMatch = window.location.pathname.match(/^(\/portal\/[^/]+)/);
  const scope = portalMatch ? portalMatch[1] : '/';

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope,
    });

    // If there's already a waiting worker from a previous visit, notify immediately
    if (registration.waiting && navigator.serviceWorker.controller) {
      window.dispatchEvent(new CustomEvent('sw-updated'));
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // Notify when new SW reaches 'installed' (waiting) state — not 'activated'.
        // 'installed' means the update is ready but waiting for user action.
        // controller check ensures this is an update, not the first install.
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
