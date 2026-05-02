'use client';
import { useEffect, useState } from 'react';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { subscribeToPush } from '@/lib/pwa/push-client';
import { isIOS, isStandalone, isPushSupported } from '@/lib/pwa/ios-utils';
import { useIsMobile } from '@/lib/pwa/use-is-mobile';
import { Bell, X, Share } from 'lucide-react';

interface Props {
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
  /** For portal: headers to prove session. Admin uses cookie. */
  sessionHeaders?: Record<string, string>;
}

const DISMISS_KEY = 'opai-push-prompt-dismissed';

function isDismissedInStorage(portalType: string): boolean {
  try {
    const val = localStorage.getItem(`${DISMISS_KEY}:${portalType}`);
    if (!val) return false;
    // Dismiss expires after 30 days
    const ts = parseInt(val, 10);
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function persistDismiss(portalType: string) {
  try {
    localStorage.setItem(`${DISMISS_KEY}:${portalType}`, String(Date.now()));
  } catch {}
}

export function PushPermissionPrompt({ portalType, userType, userId, tenantId, sessionHeaders }: Props) {
  const { registration } = useServiceWorker();
  const isMobile = useIsMobile();
  const [dismissed, setDismissedRaw] = useState(() => isDismissedInStorage(portalType));
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const setDismissed = (val: boolean) => {
    setDismissedRaw(val);
    if (val) persistDismiss(portalType);
  };

  // Auto-subscribe when permission is already granted (re-subscribe ensures
  // the server always has a fresh push subscription for this device).
  useEffect(() => {
    if (!registration) return;
    if (!isPushSupported()) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    subscribeToPush({ registration, portalType, userType, userId, tenantId, sessionHeaders })
      .then((ok) => { if (ok) setSubscribed(true); })
      .catch(() => {});
  }, [registration, portalType, userType, userId, tenantId]);

  if (!isMobile) return null;

  // iOS in Safari (not standalone): show "add to homescreen" guide
  if (!dismissed && isIOS() && !isStandalone()) {
    return (
      <div className="bg-status-warn-soft border border-status-warn-border rounded-xl p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-status-warn-soft rounded-lg p-2 shrink-0">
            <Bell className="w-5 h-5 text-status-warn-fg" />
          </div>
          <p className="text-white text-sm font-medium flex-1">Instala la app para recibir notificaciones</p>
          <button onClick={() => setDismissed(true)} aria-label="Cerrar" className="text-zinc-500 hover:text-zinc-300 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-zinc-400 text-xs space-y-1 ml-11">
          <p>1. Toca el boton <Share className="w-3.5 h-3.5 inline -mt-0.5" /> de compartir</p>
          <p>2. Selecciona <strong className="text-zinc-300">&quot;Agregar a inicio&quot;</strong></p>
          <p>3. Abre la app desde tu pantalla de inicio</p>
        </div>
      </div>
    );
  }

  if (subscribed || dismissed || !registration) return null;
  if (!isPushSupported()) return null;
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return null;

  const handleEnable = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const success = await subscribeToPush({ registration, portalType, userType, userId, tenantId, sessionHeaders });
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
    <div className="bg-status-info-soft border border-status-info-border rounded-xl p-4 flex items-center gap-4">
      <div className="bg-status-info-soft rounded-lg p-2 shrink-0">
        <Bell className="w-5 h-5 text-status-info-fg" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">Activar notificaciones</p>
        <p className="text-zinc-400 text-xs">Recibe alertas importantes en tu celular</p>
      </div>
      <button
        onClick={handleEnable}
        disabled={loading}
        className="bg-status-info hover:bg-status-info disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
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
