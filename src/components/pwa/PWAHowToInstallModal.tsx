'use client';

import { useState, useEffect } from 'react';
import { X, Share, ChevronLeft, Smartphone, ArrowUp, MoreVertical, Menu } from 'lucide-react';

export type PwaBrowserChoice = 'safari_ios' | 'chrome_android' | 'samsung' | 'other';

interface PWAHowToInstallModalProps {
  appName: string;
  onClose: () => void;
}

function detectBrowser(): PwaBrowserChoice {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (isIOS) return 'safari_ios';
  const isSamsung = /SamsungBrowser/i.test(ua);
  if (isSamsung) return 'samsung';
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) return 'chrome_android';
  return 'other';
}

const BROWSER_OPTIONS: { id: PwaBrowserChoice; label: string; sublabel: string }[] = [
  { id: 'safari_ios', label: 'Safari (iPhone o iPad)', sublabel: 'Apple' },
  { id: 'chrome_android', label: 'Chrome (Android)', sublabel: 'Celular' },
  { id: 'samsung', label: 'Samsung Internet', sublabel: 'Android' },
  { id: 'other', label: 'Otro o escritorio', sublabel: 'Ver opciones' },
];

function StepBubble({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-info-soft text-status-info-fg font-bold text-base">
      {n}
    </span>
  );
}

function InstructionsContent({
  browser,
  appName,
}: {
  browser: PwaBrowserChoice;
  appName: string;
}) {
  const openShareSheet = async () => {
    if (typeof navigator.share === 'undefined') return;
    try {
      await navigator.share({
        title: appName,
        text: appName,
        url: window.location.href,
      });
    } catch {
      // cancelled
    }
  };

  if (browser === 'safari_ios') {
    return (
      <div className="space-y-5">
        <div className="rounded-xl bg-status-info-soft border border-status-info-border p-4 text-center">
          <p className="text-status-info-fg text-sm font-medium">
            En iPhone se agrega desde el menú <strong className="text-white">Compartir</strong>
          </p>
        </div>
        <ol className="space-y-5 text-sm">
          <li className="flex gap-4 items-start">
            <StepBubble n={1} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Toca el botón Compartir</p>
              <p className="text-zinc-400 text-xs">
                Es el ícono con la flecha hacia arriba
                <ArrowUp className="inline w-3.5 h-3.5 ml-1 -mt-0.5" />
                {' '}en la barra inferior de Safari.
              </p>
            </div>
          </li>
          <li className="flex gap-4 items-start">
            <StepBubble n={2} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Busca &quot;Agregar a pantalla de inicio&quot;</p>
              <p className="text-zinc-400 text-xs">
                Desliza hacia abajo en el menú que aparece hasta encontrar esta opción.
              </p>
            </div>
          </li>
          <li className="flex gap-4 items-start">
            <StepBubble n={3} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Toca &quot;Agregar&quot;</p>
              <p className="text-zinc-400 text-xs">
                ¡Listo! La app aparecerá en tu pantalla de inicio.
              </p>
            </div>
          </li>
        </ol>
        {typeof navigator !== 'undefined' && typeof navigator.share !== 'undefined' && (
          <button
            type="button"
            onClick={openShareSheet}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-status-info hover:bg-status-info text-white font-semibold py-3.5 px-4 transition-colors text-base"
          >
            <Share className="w-5 h-5" />
            Abrir menú Compartir ahora
          </button>
        )}
      </div>
    );
  }

  if (browser === 'chrome_android') {
    return (
      <div className="space-y-5">
        <div className="rounded-xl bg-status-info-soft border border-status-info-border p-4 text-center">
          <p className="text-status-info-fg text-sm font-medium">
            En Chrome se instala desde el menú <strong className="text-white">⋮</strong> (tres puntos)
          </p>
        </div>
        <ol className="space-y-5 text-sm">
          <li className="flex gap-4 items-start">
            <StepBubble n={1} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Toca los tres puntos ⋮</p>
              <p className="text-zinc-400 text-xs">
                Están en la esquina superior derecha
                <MoreVertical className="inline w-3.5 h-3.5 ml-1 -mt-0.5" />
                {' '}de Chrome.
              </p>
            </div>
          </li>
          <li className="flex gap-4 items-start">
            <StepBubble n={2} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Toca &quot;Instalar app&quot;</p>
              <p className="text-zinc-400 text-xs">
                También puede aparecer como &quot;Agregar a pantalla de inicio&quot;.
              </p>
            </div>
          </li>
          <li className="flex gap-4 items-start">
            <StepBubble n={3} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Confirma tocando &quot;Instalar&quot;</p>
              <p className="text-zinc-400 text-xs">
                ¡Listo! La app aparecerá en tu pantalla de inicio.
              </p>
            </div>
          </li>
        </ol>
      </div>
    );
  }

  if (browser === 'samsung') {
    return (
      <div className="space-y-5">
        <div className="rounded-xl bg-status-info-soft border border-status-info-border p-4 text-center">
          <p className="text-status-info-fg text-sm font-medium">
            En Samsung Internet usa el menú
            <Menu className="inline w-3.5 h-3.5 ml-1 -mt-0.5" />
          </p>
        </div>
        <ol className="space-y-5 text-sm">
          <li className="flex gap-4 items-start">
            <StepBubble n={1} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Toca el menú ☰</p>
              <p className="text-zinc-400 text-xs">
                Las tres líneas horizontales en la parte inferior.
              </p>
            </div>
          </li>
          <li className="flex gap-4 items-start">
            <StepBubble n={2} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Toca &quot;Agregar página a&quot;</p>
              <p className="text-zinc-400 text-xs">
                Luego selecciona &quot;Pantalla de inicio&quot;.
              </p>
            </div>
          </li>
          <li className="flex gap-4 items-start">
            <StepBubble n={3} />
            <div className="flex-1">
              <p className="text-white font-medium mb-1">Confirma</p>
              <p className="text-zinc-400 text-xs">
                ¡Listo! La app aparecerá en tu pantalla de inicio.
              </p>
            </div>
          </li>
        </ol>
      </div>
    );
  }

  // other / desktop
  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl bg-zinc-800/80 p-4">
        <Smartphone className="w-8 h-8 shrink-0 text-status-info-fg" />
        <div className="text-sm text-zinc-300">
          <p className="font-medium text-white mb-1">Abre esta página en tu celular</p>
          <p className="text-xs text-zinc-400">
            Abre <strong className="text-white break-all">{typeof window !== 'undefined' ? window.location.href : 'esta URL'}</strong> en Safari (iPhone) o Chrome (Android) y sigue los pasos.
          </p>
        </div>
      </div>
      <p className="text-zinc-500 text-xs text-center">
        En escritorio no se puede instalar como app móvil.
      </p>
    </div>
  );
}

export function PWAHowToInstallModal({ appName, onClose }: PWAHowToInstallModalProps) {
  const [detected, setDetected] = useState<PwaBrowserChoice | null>(null);
  const [selected, setSelected] = useState<PwaBrowserChoice | null>(null);
  const [showManualPicker, setShowManualPicker] = useState(false);

  useEffect(() => {
    const browser = detectBrowser();
    setDetected(browser);
    setSelected(browser);
  }, []);

  const showingInstructions = selected && !showManualPicker;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 pb-safe sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-howto-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 sm:animate-in sm:fade-in sm:zoom-in-95 sm:duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700/50">
          {showManualPicker ? (
            <button
              type="button"
              onClick={() => { setShowManualPicker(false); setSelected(detected); }}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
              aria-label="Volver"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver
            </button>
          ) : (
            <h2 id="pwa-howto-title" className="text-lg font-semibold text-white">
              Cómo instalar la app
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {showManualPicker ? (
            <>
              <p className="text-zinc-400 text-sm mb-4">
                Elige tu navegador:
              </p>
              <div className="space-y-2">
                {BROWSER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setSelected(opt.id); setShowManualPicker(false); }}
                    className="w-full flex items-center justify-between rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-zinc-600 px-4 py-3 text-left transition-colors"
                  >
                    <span className="text-white font-medium text-sm">{opt.label}</span>
                    <span className="text-zinc-500 text-xs">{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            </>
          ) : selected ? (
            <InstructionsContent browser={selected} appName={appName} />
          ) : null}
        </div>

        {showingInstructions && (
          <div className="border-t border-zinc-700/50 p-3 flex gap-2">
            <button
              type="button"
              onClick={() => setShowManualPicker(true)}
              className="flex-1 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 text-xs font-medium py-2.5 transition-colors"
            >
              No es mi navegador
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-status-info hover:bg-status-info text-white text-sm font-medium py-2.5 transition-colors"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
