'use client';

import { useState } from 'react';
import { X, Share, ChevronLeft, Smartphone } from 'lucide-react';

export type PwaBrowserChoice = 'safari_ios' | 'chrome_android' | 'samsung' | 'other';

interface PWAHowToInstallModalProps {
  appName: string;
  onClose: () => void;
}

const BROWSER_OPTIONS: { id: PwaBrowserChoice; label: string; sublabel: string }[] = [
  { id: 'safari_ios', label: 'Safari (iPhone o iPad)', sublabel: 'Apple' },
  { id: 'chrome_android', label: 'Chrome (Android)', sublabel: 'Celular' },
  { id: 'samsung', label: 'Samsung Internet', sublabel: 'Android' },
  { id: 'other', label: 'Otro o escritorio', sublabel: 'Ver opciones' },
];

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
        <p className="text-zinc-400 text-sm">
          En iPhone o iPad se usa el menú <strong className="text-white">Compartir</strong> de Safari.
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 font-semibold">1</span>
            <span className="text-zinc-300">
              Toca el botón <strong className="text-white">Compartir</strong> en la barra inferior (icono con flecha hacia arriba).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 font-semibold">2</span>
            <span className="text-zinc-300">
              Desliza y elige <strong className="text-white">Agregar a pantalla de inicio</strong>.
            </span>
          </li>
        </ol>
        {typeof navigator.share !== 'undefined' && (
          <button
            type="button"
            onClick={openShareSheet}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium py-3 px-4 transition-colors"
          >
            <Share className="w-5 h-5" />
            Abrir menú Compartir
          </button>
        )}
      </div>
    );
  }

  if (browser === 'chrome_android') {
    return (
      <div className="space-y-5">
        <p className="text-zinc-400 text-sm">
          En Chrome para Android puedes instalar la app desde el menú.
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 font-semibold">1</span>
            <span className="text-zinc-300">
              Toca los <strong className="text-white">tres puntos</strong> (⋮) en la esquina superior derecha.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 font-semibold">2</span>
            <span className="text-zinc-300">
              Elige <strong className="text-white">Instalar app</strong> o <strong className="text-white">Agregar a pantalla de inicio</strong>.
            </span>
          </li>
        </ol>
      </div>
    );
  }

  if (browser === 'samsung') {
    return (
      <div className="space-y-5">
        <p className="text-zinc-400 text-sm">
          En Samsung Internet el acceso está en el menú principal.
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 font-semibold">1</span>
            <span className="text-zinc-300">
              Toca el menú (三条) y luego <strong className="text-white">Agregar página a</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 font-semibold">2</span>
            <span className="text-zinc-300">
              Selecciona <strong className="text-white">Pantalla de inicio</strong>.
            </span>
          </li>
        </ol>
      </div>
    );
  }

  // other / desktop
  return (
    <div className="space-y-5">
      <p className="text-zinc-400 text-sm">
        Para tener la app en la pantalla de inicio necesitas abrir esta misma página en tu celular.
      </p>
      <div className="flex gap-3 rounded-xl bg-zinc-800/80 p-4">
        <Smartphone className="w-8 h-8 shrink-0 text-teal-400" />
        <div className="text-sm text-zinc-300">
          Abre <strong className="text-white">{typeof window !== 'undefined' ? window.location.href : 'esta URL'}</strong> en Safari (iPhone) o Chrome (Android) y sigue los pasos de esa pantalla.
        </div>
      </div>
      <p className="text-zinc-500 text-xs">
        En escritorio no se instala como app; usa el acceso directo o favoritos si lo prefieres.
      </p>
    </div>
  );
}

export function PWAHowToInstallModal({ appName, onClose }: PWAHowToInstallModalProps) {
  const [selected, setSelected] = useState<PwaBrowserChoice | null>(null);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 pb-safe sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-howto-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 sm:animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700/50">
          {selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
              aria-label="Volver"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver
            </button>
          ) : (
            <h2 id="pwa-howto-title" className="text-lg font-semibold text-white">
              Agregar al inicio
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
          {!selected ? (
            <>
              <p className="text-zinc-400 text-sm mb-5">
                Elige tu navegador para ver los pasos y agregar <strong className="text-white">{appName}</strong> a la pantalla de inicio.
              </p>
              <div className="space-y-2">
                {BROWSER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelected(opt.id)}
                    className="w-full flex items-center justify-between rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-zinc-600 px-4 py-3 text-left transition-colors group"
                  >
                    <span className="text-white font-medium text-sm">{opt.label}</span>
                    <span className="text-zinc-500 text-xs">{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <InstructionsContent browser={selected} appName={appName} />
          )}
        </div>

        {selected && (
          <div className="border-t border-zinc-700/50 p-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-zinc-700/80 hover:bg-zinc-600 text-white text-sm font-medium py-2.5 transition-colors"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
