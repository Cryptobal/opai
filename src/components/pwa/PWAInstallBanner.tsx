'use client';
import { useState, useEffect } from 'react';
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt';
import { X, Download, Share } from 'lucide-react';
import { PWAHowToInstallModal } from './PWAHowToInstallModal';

interface PWAInstallBannerProps {
  appName: string;
  appDescription?: string;
  iconSrc: string;
  variant?: 'banner' | 'fullscreen' | 'inline';
  dismissKey?: string;
}

export function PWAInstallBanner({
  appName,
  appDescription = 'Instala la app para acceso rápido',
  iconSrc,
  variant = 'banner',
  dismissKey,
}: PWAInstallBannerProps) {
  const { canInstall, isIOS, isInstalled, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);

  useEffect(() => {
    if (!dismissKey) return;
    setDismissed(false);
    const stored = localStorage.getItem(`pwa-dismiss-${dismissKey}`);
    if (stored) {
      const dismissedAt = new Date(stored);
      const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) setDismissed(true);
    }
  }, [dismissKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      localStorage.setItem(`pwa-dismiss-${dismissKey}`, new Date().toISOString());
    }
  };

  if (isInstalled || dismissed) return null;
  if (variant !== 'fullscreen' && !canInstall && !isIOS) return null;

  const handleInstall = async () => {
    const accepted = await install();
    if (!accepted) handleDismiss();
  };

  const handleIOSInstall = async () => {
    if (typeof navigator.share !== 'undefined') {
      try {
        await navigator.share({
          title: appName,
          text: appName,
          url: window.location.href,
        });
      } catch {
        setShowHowToModal(true);
      }
    } else {
      setShowHowToModal(true);
    }
  };

  if (variant === 'fullscreen') {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col items-center justify-center p-8 text-center">
          <img src={iconSrc} alt={appName} className="w-24 h-24 rounded-2xl mb-6 shadow-lg" />
          <h1 className="text-2xl font-bold text-white mb-2">{appName}</h1>
          <p className="text-zinc-400 mb-8 max-w-xs">{appDescription}</p>

          {canInstall ? (
            <button
              onClick={handleInstall}
              className="w-full max-w-xs bg-status-info hover:bg-status-info text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-colors text-lg"
            >
              <Download className="w-5 h-5" />
              Instalar App
            </button>
          ) : isIOS ? (
            <button
              onClick={handleIOSInstall}
              className="w-full max-w-xs bg-status-info hover:bg-status-info text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-colors text-lg"
            >
              <Share className="w-5 h-5" />
              Agregar a pantalla de inicio
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowHowToModal(true)}
              className="w-full max-w-xs bg-status-info hover:bg-status-info text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-colors text-lg"
            >
              <Download className="w-5 h-5" />
              Ver cómo instalar
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowHowToModal(true)}
            className="mt-4 text-status-info-fg hover:text-status-info-fg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            ¿No funciona? Ver instrucciones paso a paso
          </button>

          <button
            onClick={handleDismiss}
            className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
          >
            Continuar en el navegador
          </button>
        </div>
        {showHowToModal && (
          <PWAHowToInstallModal appName={appName} onClose={() => setShowHowToModal(false)} />
        )}
      </>
    );
  }

  if (variant === 'inline') {
    return (
      <>
        <div className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 flex items-center gap-4">
          <img src={iconSrc} alt={appName} className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{appName}</p>
            <p className="text-zinc-400 text-xs truncate">{appDescription}</p>
          </div>
          {canInstall ? (
            <button
              onClick={handleInstall}
              className="bg-status-info hover:bg-status-info text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
            >
              Instalar
            </button>
          ) : isIOS ? (
            <button
              onClick={handleIOSInstall}
              className="bg-status-info hover:bg-status-info text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
            >
              Agregar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowHowToModal(true)}
              className="shrink-0 flex flex-col items-center gap-0.5 text-status-info-fg hover:text-status-info-fg text-xs font-medium transition-colors"
            >
              <Share className="w-4 h-4" />
              <span>Ver cómo</span>
            </button>
          )}
          <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 shrink-0 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        {showHowToModal && (
          <PWAHowToInstallModal appName={appName} onClose={() => setShowHowToModal(false)} />
        )}
      </>
    );
  }

  // Default: banner (fixed bottom)
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe animate-in slide-in-from-bottom duration-300">
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl p-4 flex items-center gap-4 shadow-2xl max-w-lg mx-auto">
          <img src={iconSrc} alt={appName} className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{appName}</p>
            <p className="text-zinc-400 text-xs truncate">{appDescription}</p>
          </div>
          {canInstall ? (
            <button
              onClick={handleInstall}
              className="bg-status-info hover:bg-status-info text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
            >
              Instalar
            </button>
          ) : isIOS ? (
            <button
              onClick={handleIOSInstall}
              className="bg-status-info hover:bg-status-info text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
            >
              Agregar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowHowToModal(true)}
              className="shrink-0 flex flex-col items-center gap-0.5 text-status-info-fg hover:text-status-info-fg text-xs font-medium transition-colors"
            >
              <Share className="w-4 h-4" />
              <span>Ver cómo</span>
            </button>
          )}
          <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      {showHowToModal && (
        <PWAHowToInstallModal appName={appName} onClose={() => setShowHowToModal(false)} />
      )}
    </>
  );
}
