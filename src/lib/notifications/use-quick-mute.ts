"use client";
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useQuickMute() {
  const [muting, setMuting] = useState(false);

  const muteType = useCallback(async (type: string, label?: string): Promise<boolean> => {
    setMuting(true);
    try {
      const res = await fetch('/api/notifications/preferences/quick-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (json.success) {
        toast.success(`Silenciado: ${label ?? type}`, {
          description: 'Ya no recibirás este tipo en ningún canal',
          action: {
            label: 'Configurar',
            onClick: () => {
              if (typeof window !== 'undefined') {
                window.location.href = `/opai/perfil/notificaciones?type=${encodeURIComponent(type)}`;
              }
            },
          },
        });
        return true;
      }
      toast.error(json.error ?? 'No se pudo silenciar');
      return false;
    } catch {
      toast.error('Error al silenciar');
      return false;
    } finally {
      setMuting(false);
    }
  }, []);

  return { muteType, muting };
}
