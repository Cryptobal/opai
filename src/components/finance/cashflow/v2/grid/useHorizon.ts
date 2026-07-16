"use client";

import { useCallback, useEffect, useState } from "react";

export const HORIZON_OPTIONS = [8, 16, 24, 32] as const;
export type HorizonWeeks = (typeof HORIZON_OPTIONS)[number];

const KEY = "opai.cashflow.horizon";
const DEFAULT: HorizonWeeks = 8;

function parseHorizon(raw: string | null): HorizonWeeks {
  const n = Number(raw);
  return (HORIZON_OPTIONS as readonly number[]).includes(n)
    ? (n as HorizonWeeks)
    : DEFAULT;
}

/**
 * Horizonte de semanas visibles (desktop). Persiste en localStorage
 * SSR-safe: default 8 hasta el useEffect post-mount (mismo patrón que
 * SaludFinancieraHero).
 */
export function useHorizon() {
  const [horizon, setHorizonRaw] = useState<HorizonWeeks>(DEFAULT);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setHorizonRaw(parseHorizon(window.localStorage.getItem(KEY)));
    } catch {
      /* private mode */
    }
  }, []);

  const setHorizon = useCallback((next: HorizonWeeks) => {
    setHorizonRaw(next);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, String(next));
      }
    } catch {
      /* best-effort */
    }
  }, []);

  return { horizon, setHorizon };
}
