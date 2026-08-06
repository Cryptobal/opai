"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Oculta el splash nativo de Capacitor tras el primer paint real.
 * El splash se mantiene visible (launchShowDuration alto) hasta este hide;
 * así no hay flash blanco/negro entre el splash y el contenido web.
 */
export function NativeSplashGate() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    const hide = async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (cancelled) return;
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        // Nunca romper el render si el plugin falla o no está disponible.
      }
    };

    // Dos rAF: garantiza que el primer frame ya se pintó en el WebView.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void hide();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  return null;
}
