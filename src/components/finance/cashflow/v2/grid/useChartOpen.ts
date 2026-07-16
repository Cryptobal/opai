"use client";

import { useEffect, useState } from "react";

const CHART_KEY = "opai.cashflow.chart";

/** Persistencia open|closed del mini-gráfico. Default: open desktop / closed móvil. */
export function useChartOpen(isMobile: boolean) {
  const [open, setOpen] = useState(!isMobile);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHART_KEY);
      if (raw === "open" || raw === "closed") setOpen(raw === "open");
      else setOpen(!isMobile);
    } catch {
      /* private mode */
    }
  }, [isMobile]);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CHART_KEY, next ? "open" : "closed");
      } catch {
        /* best-effort */
      }
      return next;
    });
  };
  return { open, toggle };
}
