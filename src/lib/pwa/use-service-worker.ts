'use client';
import { useEffect, useState } from 'react';
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

  const applyUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  return { registration, updateAvailable, applyUpdate };
}
