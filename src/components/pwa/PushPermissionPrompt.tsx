'use client';
import { useEffect, useState } from 'react';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { subscribeToPush } from '@/lib/pwa/push-client';
import { Bell, X } from 'lucide-react';

interface Props {
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
}

export function PushPermissionPrompt({ portalType, userType, userId, tenantId }: Props) {
  const { registration } = useServiceWorker();
  const [dismissed, setDismissed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-subscribe when permission is already granted (re-subscribe ensures
  // the server always has a fresh push subscription for this device).
  useEffect(() => {
    if (!registration) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    subscribeToPush({ registration, portalType, userType, userId, tenantId })
      .then((ok) => { if (ok) setSubscribed(true); })
      .catch(() => {});
  }, [registration, portalType, userType, userId, tenantId]);

  if (subscribed || dismissed || !registration) return null;
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return null;

  const handleEnable = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const success = await subscribeToPush({ registration, portalType, userType, userId, tenantId });
      if (success) {
        setSubscribed(true);
      } else {
        setDismissed(true);
      }
    } catch {
      setDismissed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-4">
      <div className="bg-blue-600/20 rounded-lg p-2 shrink-0">
        <Bell className="w-5 h-5 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">Activar notificaciones</p>
        <p className="text-zinc-400 text-xs">Recibe alertas importantes en tu celular</p>
      </div>
      <button
        onClick={handleEnable}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
      >
        {loading ? 'Activando...' : 'Activar'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Cerrar"
        className="text-zinc-500 hover:text-zinc-300 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
