"use client";

import { useEffect } from "react";
import { usePlatform } from "@/hooks/usePlatform";

/**
 * Setea data-platform="ios|android|web" en <html>.
 * Permite CSS condicional global sin JS extra:
 *   html[data-platform="ios"] .my-class { ... }
 */
export function PlatformDataAttribute() {
  const platform = usePlatform();
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-platform", platform);
    }
  }, [platform]);
  return null;
}
