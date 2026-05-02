"use client";

import { useEffect, useState } from "react";

/**
 * Returns true if viewport width is below `breakpoint` (default 768px).
 * Uses matchMedia for performance and SSR safety.
 * Returns false on initial render to avoid hydration mismatch.
 */
export function useIsMobileViewport(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
