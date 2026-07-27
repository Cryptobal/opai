"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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
