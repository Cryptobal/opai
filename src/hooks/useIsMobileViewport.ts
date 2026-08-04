"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Returns true if viewport width is below `breakpoint` (default 768px).
 * Uses matchMedia via useSyncExternalStore so the first client paint
 * already has the correct value (avoids a false→true flip that remounts
 * Sheet side="right"→"bottom" and can leave a black overlay with no panel).
 */
export function useIsMobileViewport(breakpoint = 768): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    [breakpoint],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  }, [breakpoint]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
