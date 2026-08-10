"use client";

import { useCallback, useEffect, useState } from "react";
import type { FlowInsightsDto } from "@/modules/finance/flow-v3/insights-types";

const CACHE_TTL_MS = 30_000;
let insightsCache: { at: number; data: FlowInsightsDto } | null = null;

export function invalidatePanelInsightsCache() {
  insightsCache = null;
}

export function usePanelInsights() {
  const [data, setData] = useState<FlowInsightsDto | null>(
    insightsCache?.data ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!insightsCache);

  const load = useCallback((force = false) => {
    if (
      !force &&
      insightsCache &&
      Date.now() - insightsCache.at < CACHE_TTL_MS
    ) {
      setData(insightsCache.data);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return fetch("/api/finance/flow-v3/insights", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Error");
        const next = j.data as FlowInsightsDto;
        insightsCache = { at: Date.now(), data: next };
        setData(next);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, load };
}
