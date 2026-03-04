'use client';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { toast } from 'sonner';
import { useEffect } from 'react';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { updateAvailable, applyUpdate } = useServiceWorker();

  useEffect(() => {
    if (updateAvailable) {
      toast('Nueva versión disponible', {
        description: 'Toca para actualizar la aplicación',
        action: {
          label: 'Actualizar',
          onClick: applyUpdate,
        },
        duration: Infinity,
      });
    }
  }, [updateAvailable, applyUpdate]);

  return <>{children}</>;
}
