'use client';
import { useCallback, useEffect, useState } from 'react';
import { registerServiceWorker } from './register-sw';

export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    registerServiceWorker().then(setRegistration);

    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sw-updated', handleUpdate);
    return () => window.removeEventListener('sw-updated', handleUpdate);
  }, []);

  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      // Wait for the new SW to take control before reloading
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, [registration]);

  return { registration, updateAvailable, applyUpdate };
}
