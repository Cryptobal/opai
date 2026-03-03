"use client";

import { useState, useEffect } from "react";

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3">
      <p className="flex-1 text-base text-gray-200">
        Instalar Rondas para acceso rápido
      </p>
      <button
        onClick={async () => {
          if (deferredPrompt) {
            try {
              deferredPrompt.prompt();
              await deferredPrompt.userChoice;
            } catch {
              // Browser may reject prompt silently
            }
            setShow(false);
            setDeferredPrompt(null);
          }
        }}
        className="rounded-lg bg-teal-600 px-4 py-2 text-base font-semibold text-white"
        aria-label="Instalar la aplicación Rondas"
      >
        Instalar
      </button>
      <button
        onClick={() => setShow(false)}
        className="text-gray-500 text-sm"
        aria-label="Descartar"
      >
        No
      </button>
    </div>
  );
}
