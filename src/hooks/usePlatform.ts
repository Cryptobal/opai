"use client";

import { useEffect, useState } from "react";

export type Platform = "ios" | "android" | "web";

/**
 * Detecta la plataforma de ejecución del portal móvil.
 *
 * Orden de prioridad:
 * 1. Capacitor.getPlatform() si está disponible (app nativa vía Capacitor)
 * 2. User-Agent heuristics (PWA en Safari iOS / Chrome Android)
 * 3. Default: "web"
 *
 * SSR-safe: siempre retorna "web" en el primer render del servidor,
 * luego hidrata con el valor real en el cliente.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("web");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      if (p === "ios" || p === "android") {
        setPlatform(p);
        return;
      }
    }

    const ua = window.navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) {
      setPlatform("ios");
    } else if (/android/i.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("web");
    }
  }, []);

  return platform;
}

export function useIsIOS(): boolean {
  return usePlatform() === "ios";
}

export function useIsAndroid(): boolean {
  return usePlatform() === "android";
}
