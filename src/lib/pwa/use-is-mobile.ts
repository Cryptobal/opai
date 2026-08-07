"use client";

import { BP } from "@/lib/breakpoints";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

/**
 * True when viewport width is below `BP.md`.
 * Used by legacy PWA callers; prefer `useIsTouchLayout()` for chrome
 * aligned with the shell (`lg`).
 *
 * @deprecated Preferir `useIsTouchLayout` de `@/lib/breakpoints`.
 */
export function useIsMobile(): boolean {
  return useIsMobileViewport(BP.md);
}
