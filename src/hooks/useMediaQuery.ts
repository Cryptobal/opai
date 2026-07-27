"use client";

import { useSyncExternalStore } from "react";

/**
 * Suscribe a un `matchMedia(query)` sin hydration mismatch.
 * En SSR / primer paint del servidor siempre devuelve `false`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    () => false,
  );
}
