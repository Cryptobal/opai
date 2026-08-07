"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";

/** Breakpoints Tailwind por defecto — fuente única de verdad. */
export const BP = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/**
 * Ancho máximo del layout táctil. Alineado con el shell:
 * MobileIsland/BottomNav usan `lg:hidden`, el sidebar `hidden lg:block`.
 * iPad vertical (744–1024) queda del lado táctil a propósito.
 */
export const TOUCH_LAYOUT_MAX = BP.lg - 1; // 1023

/** Media query canónica para layout táctil (shell móvil). */
export const TOUCH_LAYOUT_QUERY = `(max-width: ${TOUCH_LAYOUT_MAX}px)`;

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
