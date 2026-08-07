"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TOUCH_LAYOUT_QUERY } from "@/lib/breakpoints";

/**
 * True cuando el viewport está en el rango del shell táctil (`< lg`).
 * Usar para chrome, sheets, toasts y gestos que deben coincidir con
 * MobileIsland / BottomNav (visibles bajo `lg:hidden`).
 *
 * No usar User-Agent ni detección de iPad: en Split View / Stage Manager
 * el layout debe reaccionar al ancho de la ventana.
 */
export function useIsTouchLayout(): boolean {
  return useMediaQuery(TOUCH_LAYOUT_QUERY);
}
