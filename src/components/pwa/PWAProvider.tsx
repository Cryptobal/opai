'use client';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { useIsMobile } from '@/lib/pwa/use-is-mobile';
import { InAppNotificationProvider } from './InAppNotificationProvider';
import { toast } from 'sonner';
import { useEffect } from 'react';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { updateAvailable, applyUpdate } = useServiceWorker();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile || !updateAvailable) return;
    toast('Nueva versión disponible', {
      description: 'Toca para actualizar la aplicación',
      action: {
        label: 'Actualizar',
        onClick: applyUpdate,
      },
      duration: Infinity,
    });
  }, [isMobile, updateAvailable, applyUpdate]);

  return (
    <InAppNotificationProvider>
      {children}
    </InAppNotificationProvider>
  );
}
