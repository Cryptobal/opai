'use client';

/**
 * Public Presentation Tracker
 * 
 * Client component que registra automáticamente las vistas
 * de presentaciones públicas
 */

import { useEffect, useRef } from 'react';

interface PublicPresentationTrackerProps {
  presentationId: string;
  ipAddress: string;
  userAgent: string;
}

export function PublicPresentationTracker({
  presentationId,
  ipAddress,
  userAgent,
}: PublicPresentationTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    // Solo trackear una vez por sesión
    if (tracked.current) return;

    const trackView = async () => {
      try {
        // Detectar tipo de dispositivo
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
        const device = isMobile ? 'mobile' : 'desktop';

        // Detectar browser
        let browser = 'other';
        if (userAgent.includes('Chrome')) browser = 'chrome';
        else if (userAgent.includes('Safari')) browser = 'safari';
        else if (userAgent.includes('Firefox')) browser = 'firefox';
        else if (userAgent.includes('Edge')) browser = 'edge';

        // Registrar vista
        await fetch(`/api/presentations/${presentationId}/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ipAddress,
            userAgent,
            device,
            browser,
          }),
        });

        tracked.current = true;
      } catch (error) {
        console.error('Error al trackear vista:', error);
      }
    };

    trackView();
  }, [presentationId, ipAddress, userAgent]);

  // Este componente no renderiza nada
  return null;
}
