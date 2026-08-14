"use client";

import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { QuoteSummary, isOpenPortalQuote } from "./types";

interface DashboardCotizacionesPendientesProps {
  isProspect: boolean;
  onNavigateToDetail: (section: string) => void;
}

export function DashboardCotizacionesPendientes({
  isProspect,
  onNavigateToDetail,
}: DashboardCotizacionesPendientesProps) {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setQuotes((json.data as QuoteSummary[]).filter(isOpenPortalQuote));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-20 rounded-2xl bg-ds-surface-2" />;
  if (quotes.length === 0) return null;

  const section = isProspect ? "propuesta" : "cotizaciones";
  const first = quotes[0];
  const cost = formatCurrency(first.monthlyCost, first.currency === "UF" ? "UF" : "CLP");

  if (isProspect) {
    return (
      <button
        type="button"
        onClick={() => onNavigateToDetail(section)}
        className="w-full text-left rounded-2xl border border-tint-orange-fg/30 bg-tint-orange p-5 min-h-11"
      >
        <p className="text-ds-caption font-mono uppercase tracking-[0.08em] text-tint-orange-fg">
          Propuesta lista
        </p>
        <p className="mt-1 font-display text-ds-heading text-ds-text-1">Tu propuesta está lista</p>
        <p className="mt-1 text-ds-body text-ds-text-3">
          {quotes.length === 1
            ? `${cost}/mes · revísala y continúa el proceso`
            : `${quotes.length} propuestas abiertas · desde ${cost}/mes`}
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-ds-caption font-semibold text-tint-orange-fg">
          Ver propuesta <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigateToDetail(section)}
      className="w-full text-left rounded-2xl border border-primary/30 bg-primary/10 p-5 min-h-11"
    >
      <p className="text-ds-caption font-mono uppercase tracking-[0.08em] text-primary">
        Cotizaciones
      </p>
      <p className="mt-1 font-display text-ds-heading text-ds-text-1">
        Tienes {quotes.length} propuesta{quotes.length !== 1 ? "s" : ""} abierta{quotes.length !== 1 ? "s" : ""}
      </p>
      <p className="mt-1 text-ds-body text-ds-text-3">
        {first.code} · {cost}/mes
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-ds-caption font-semibold text-primary">
        Revisar <ArrowRight className="h-4 w-4" />
      </span>
    </button>
  );
}
