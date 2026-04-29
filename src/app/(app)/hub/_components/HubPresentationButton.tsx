"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Botón "Modo presentación" — solo visible en desktop.
 *
 * Usa la Fullscreen API nativa sobre el <main> para que el navegador oculte
 * toda la chrome (sidebar, topbar, browser tabs, OS bar) automáticamente.
 * Al salir con Esc, el listener de `fullscreenchange` mantiene el estado
 * sincronizado.
 *
 * Adicionalmente aplica una clase `hub-presentation-mode` al <html> que sube
 * la tipografía base y agranda el padding del <main> para mejor lectura
 * desde la sala de reuniones.
 */
export function HubPresentationButton() {
  const [active, setActive] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);

  // Resolver el target una sola vez (el <main> más cercano).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      targetRef.current = document.querySelector('main');
    }
  }, []);

  // Mantener `active` en sync con el estado real del fullscreen
  // (cubre el caso de salir con Esc).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Aplicar / quitar la clase global solo cuando hay cambio de estado.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (active) html.classList.add('hub-presentation-mode');
    else html.classList.remove('hub-presentation-mode');
    return () => html.classList.remove('hub-presentation-mode');
  }, [active]);

  const toggle = useCallback(async () => {
    if (typeof document === 'undefined') return;

    // Salir si ya estamos en fullscreen.
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        setActive(false);
      }
      return;
    }

    // Entrar a fullscreen sobre el <main>.
    const target = targetRef.current ?? document.documentElement;
    try {
      await target.requestFullscreen();
      // active se actualiza vía el listener fullscreenchange
    } catch {
      // Fallback: si el browser no soporta FS API, al menos aplicamos la clase.
      setActive(true);
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        title={active ? 'Salir presentación (Esc)' : 'Modo presentación (Esc para salir)'}
      >
        {active ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
        {active ? 'Salir presentación' : 'Modo presentación'}
      </button>

      <style jsx global>{`
        /* En modo presentación, agrandamos tipografía base y padding del main.
           El navegador ya oculta sidebar/topbar/chrome al estar en fullscreen. */
        html.hub-presentation-mode {
          font-size: 17px;
        }
        html.hub-presentation-mode main {
          background: hsl(var(--background));
          padding: 2rem 3rem !important;
          height: 100vh !important;
          max-width: 100vw !important;
          overflow-y: auto !important;
        }
        @media (min-width: 1280px) {
          html.hub-presentation-mode main {
            padding: 2.5rem 4rem !important;
          }
        }
        /* Subir un poco el contraste de las labels pequeñas para sala de reuniones */
        html.hub-presentation-mode .text-\\[10px\\],
        html.hub-presentation-mode .text-\\[11px\\] {
          font-size: 0.875rem !important;
        }
        html.hub-presentation-mode .text-xs {
          font-size: 0.95rem !important;
        }
      `}</style>
    </>
  );
}
