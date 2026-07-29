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

  // Factor de forma para CSS condicional futuro (phone / tablet / desktop).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqTablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const mqDesktop = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const ff = mqDesktop.matches ? "desktop" : mqTablet.matches ? "tablet" : "phone";
      document.documentElement.setAttribute("data-formfactor", ff);
    };
    apply();
    mqTablet.addEventListener("change", apply);
    mqDesktop.addEventListener("change", apply);
    return () => {
      mqTablet.removeEventListener("change", apply);
      mqDesktop.removeEventListener("change", apply);
    };
  }, []);

  return null;
}
