"use client";

import { useState, useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { QuoteSummary, isOpenPortalQuote, getDisplayStatus, STATUS_LABEL, STATUS_BADGE } from "./types";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const openQuotes = (json.data as QuoteSummary[]).filter(isOpenPortalQuote);
          setQuotes(openQuotes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-32 rounded-xl bg-zinc-800/50 mb-6" />;
  if (quotes.length === 0) return null;

  const navigateSection = isProspect ? "propuesta" : "cotizaciones";

  /* ── Prospect: Hero-like prominent display ── */
  if (isProspect) {
    return (
      <div className="mb-6">
        <div
          className="rounded-2xl border border-teal-500/20 p-5 space-y-4"
          style={{ background: "linear-gradient(145deg, rgba(13,148,136,0.08), rgba(30,41,59,0.95))" }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-400" />
              </span>
              <h3 className="text-sm font-semibold text-white">
                Tu propuesta de seguridad está lista
              </h3>
            </div>
            <p className="text-xs text-zinc-400">
              Se ha preparado una propuesta exclusiva para tu empresa. Revísala y comienza a operar
              con el sistema de seguridad más completo de Chile.
            </p>
          </div>

          {/* Quote cards */}
          {quotes.length === 1 ? (
            <ProspectQuoteCard quote={quotes[0]} onView={() => onNavigateToDetail(navigateSection)} />
          ) : (
            <>
              {/* Mobile: horizontal scroll */}
              <div className="md:hidden">
                <div
                  ref={scrollRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide"
                >
                  {quotes.map((q) => (
                    <ProspectQuoteCard
                      key={q.id}
                      quote={q}
                      onView={() => onNavigateToDetail(navigateSection)}
                      className="min-w-[260px] snap-center"
                    />
                  ))}
                </div>
                {quotes.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-2">
                    {quotes.map((_, i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    ))}
                  </div>
                )}
              </div>
              {/* Desktop: grid */}
              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {quotes.map((q) => (
                  <ProspectQuoteCard key={q.id} quote={q} onView={() => onNavigateToDetail(navigateSection)} />
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] text-zinc-600 text-center">
            Propuesta exclusiva · Plataforma OPAI
          </p>
        </div>
      </div>
    );
  }

  /* ── Client: Notification banner ── */
  return (
    <div className="mb-6">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-400" />
          </span>
          <span className="text-sm font-medium text-white">
            Tienes {quotes.length} propuesta{quotes.length !== 1 ? "s" : ""} abierta{quotes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-2">
          {quotes.slice(0, 3).map((q) => (
            <button
              key={q.id}
              onClick={() => onNavigateToDetail(navigateSection)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-status-info-fg shrink-0" />
                <span className="text-xs text-zinc-300 truncate">{q.code}</span>
              </div>
              <span className="text-xs font-medium text-status-info-fg shrink-0 ml-2">
                {formatCurrency(q.monthlyCost, q.currency === "UF" ? "UF" : "CLP")}/mes
              </span>
            </button>
          ))}
        </div>

        {quotes.length > 3 && (
          <button
            onClick={() => onNavigateToDetail(navigateSection)}
            className="text-xs text-status-info-fg hover:text-status-info-fg transition-colors"
          >
            Ver todas en Propuestas →
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Prospect card sub-component ── */

function ProspectQuoteCard({
  quote, onView, className,
}: {
  quote: QuoteSummary;
  onView: () => void;
  className?: string;
}) {
  const disp = getDisplayStatus(quote);
  const badgeCls = STATUS_BADGE[disp] ?? STATUS_BADGE.draft;
  const badgeLabel = STATUS_LABEL[disp] ?? quote.status;
  const displayCost = quote.currency === "UF"
    ? `${quote.monthlyCost?.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"} UF/mes`
    : `$${quote.monthlyCost?.toLocaleString("es-CL") ?? "—"}/mes`;

  return (
    <div
      className={`rounded-xl p-4 border border-white/[0.06] transition-all hover:-translate-y-0.5 ${className ?? ""}`}
      style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)" }}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-zinc-400">{quote.code}</span>
        <span className={cn("text-xs px-2 py-0.5 rounded-full", badgeCls)}>
          {badgeLabel}
        </span>
      </div>
      <div className="text-lg font-bold text-white mb-1">{displayCost}</div>
      <div className="text-xs text-zinc-400 mb-1">
        <span className="block">{quote.clientName ?? quote.name ?? quote.code}</span>
        {(quote.installationName || quote.quoteName) && (
          <span className="block mt-0.5 text-zinc-500">
            {[quote.installationName, quote.quoteName].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-500 mb-3">
        {quote.totalPositions} puesto{quote.totalPositions !== 1 ? "s" : ""} · {quote.totalGuards} guardia{quote.totalGuards !== 1 ? "s" : ""}
      </div>
      <button
        onClick={onView}
        className="w-full text-xs font-medium py-2 rounded-lg text-center"
        style={{ background: "linear-gradient(135deg, #2dd4bf, #14b8a6)", color: "#042F2E" }}
      >
        Ver propuesta completa
      </button>
    </div>
  );
}
