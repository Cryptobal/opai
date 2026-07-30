"use client";

import { useCallback, useEffect, useState } from "react";
import type { CpqPosition, CpqServiceGroup } from "@/types/cpq";

export type BundleQuoteDetail = {
  id: string;
  code: string;
  name: string | null;
  currency: string;
  monthlyCost: number | string;
  totalGuards: number;
  totalPositions: number;
  status: string;
  paymentTerms: string;
  contractDuration: number;
  installation: { id: string; name: string } | null;
  parameters: {
    marginPct: number | string;
    marginMode: string;
    salePriceMonthly: number | string;
  } | null;
  positions: CpqPosition[];
};

export function useBundleQuote(quoteId: string | null) {
  const [quote, setQuote] = useState<BundleQuoteDetail | null>(null);
  const [serviceGroups, setServiceGroups] = useState<CpqServiceGroup[]>([]);
  const [costsSummary, setCostsSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ufValue, setUfValue] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!quoteId) return;
    setLoading(true);
    setError(null);
    try {
      const [quoteRes, servicesRes, costsRes, ufRes] = await Promise.all([
        fetch(`/api/cpq/quotes/${quoteId}`),
        fetch(`/api/cpq/quotes/${quoteId}/services`),
        fetch(`/api/cpq/quotes/${quoteId}/costs`),
        fetch("/api/fx/uf").catch(() => null),
      ]);
      if (!quoteRes.ok) {
        setError("Error al cargar cotización");
        return;
      }
      const quoteJson = await quoteRes.json();
      if (!quoteJson.success) {
        setError(quoteJson.error || "Cotización no encontrada");
        return;
      }
      setQuote(quoteJson.data as BundleQuoteDetail);

      if (servicesRes.ok) {
        const s = await servicesRes.json();
        if (s.success) setServiceGroups(s.data || []);
      }
      if (costsRes.ok) {
        const c = await costsRes.json();
        if (c.success) setCostsSummary(c.data ?? c.summary ?? null);
      }
      if (ufRes?.ok) {
        const u = await ufRes.json();
        if (u?.success && Number(u.value) > 0) setUfValue(Number(u.value));
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateMargin = useCallback(
    async (marginPct: number) => {
      if (!quoteId) return;
      await fetch(`/api/cpq/quotes/${quoteId}/margin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marginPct }),
      });
      await refresh();
    },
    [quoteId, refresh],
  );

  return {
    quote,
    positions: quote?.positions ?? [],
    serviceGroups,
    costsSummary,
    loading,
    error,
    ufValue,
    refresh,
    updateMargin,
  };
}
