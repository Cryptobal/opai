"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isProductividadPath, type Surface } from "@/lib/surface";

/** Clave sessionStorage: última ruta visitada del portal Productividad. */
export const LAST_PRODUCTIVIDAD_PATH_KEY = "opai-last-productividad-path";

/** Lee la última ruta de Productividad guardada en sessionStorage. */
export function readLastProductividadPath(): string | null {
  try {
    return sessionStorage.getItem(LAST_PRODUCTIVIDAD_PATH_KEY);
  } catch {
    return null;
  }
}

/** Guarda la última ruta del portal visitada (sessionStorage). */
export function useTrackProductividadPath(surface: Surface) {
  const pathname = usePathname() ?? "";
  useEffect(() => {
    if (surface !== "productividad") return;
    if (!pathname || !isProductividadPath(pathname)) return;
    try {
      sessionStorage.setItem(LAST_PRODUCTIVIDAD_PATH_KEY, pathname);
    } catch {
      /* ignore */
    }
  }, [pathname, surface]);
}

/**
 * Si la cookie dice Productividad pero el pathname es una ruta ERP
 * (p. ej. cotización abierta desde Correos), pasa automáticamente a ERP
 * para que el selector, sidebar y flujos (enviar propuesta) coincidan.
 * No navega: solo actualiza cookie + refresh del layout.
 */
export function useAutoSwitchSurfaceToErp(surface: Surface) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const inflightRef = useRef<string | null>(null);

  useEffect(() => {
    if (surface !== "productividad") return;
    if (!pathname || isProductividadPath(pathname)) return;
    if (inflightRef.current === pathname) return;

    inflightRef.current = pathname;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/me/surface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface: "erp" }),
        });
        if (cancelled || !res.ok) return;
        router.refresh();
      } catch {
        /* red: el usuario puede cambiar superficie a mano */
      } finally {
        if (!cancelled) inflightRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, surface, router]);
}
