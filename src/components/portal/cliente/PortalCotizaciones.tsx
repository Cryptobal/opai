"use client";

import { useState, useEffect, useMemo } from "react";
import { FileText, Loader2, XCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PortalContractForm } from "./PortalContractForm";
import {
  QuoteSummary, QuoteDetail, DealGroup,
  getDisplayStatus, isActionable, groupByDeal,
} from "./cotizaciones/types";
import { CotizacionCard } from "./cotizaciones/CotizacionCard";
import { CotizacionApproveDialog } from "./cotizaciones/CotizacionApproveDialog";
import { CotizacionRejectDialog } from "./cotizaciones/CotizacionRejectDialog";
import { ContratoBorradorView } from "./cotizaciones/ContratoBorradorView";
import { WhatsAppButton } from "./cotizaciones/WhatsAppButton";

/* ── Filter tabs ── */

type FilterTab = "todas" | "pendientes" | "aprobadas" | "rechazadas";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pendientes", label: "Pendientes" },
  { key: "aprobadas", label: "Aprobadas" },
  { key: "rechazadas", label: "Rechazadas" },
];

function filterQuotes(quotes: QuoteSummary[], tab: FilterTab): QuoteSummary[] {
  switch (tab) {
    case "pendientes":
      return quotes.filter((q) => q.status === "sent" || q.status === "draft");
    case "aprobadas":
      return quotes.filter((q) => q.status === "approved");
    case "rechazadas":
      return quotes.filter((q) => q.status === "rejected");
    default:
      return quotes;
  }
}

/* ══════════════════════════════════════════════════════ */

interface Props {
  session: ClienteSession;
  isProspect?: boolean;
  onNavigate?: (section: string) => void;
}

export function PortalCotizaciones({ session, isProspect, onNavigate }: Props) {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("todas");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Dialogs
  const [approveQuoteId, setApproveQuoteId] = useState<string | null>(null);
  const [rejectQuoteId, setRejectQuoteId] = useState<string | null>(null);

  // Contract form (client only, after approval)
  const [showContractForm, setShowContractForm] = useState<string | null>(null);

  // Contract draft view
  const [contractDraftQuoteId, setContractDraftQuoteId] = useState<string | null>(null);

  const context = isProspect ? "prospect" : "client";

  /* ── Load list ── */
  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (json.success) setQuotes(json.data);
        else setError(json.error ?? "Error al cargar cotizaciones");
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  /* ── Filtered + grouped quotes ── */
  const filtered = useMemo(() => filterQuotes(quotes, activeTab), [quotes, activeTab]);
  const dealGroups = useMemo<DealGroup[]>(() => {
    if (!isProspect) return [];
    return groupByDeal(filtered);
  }, [filtered, isProspect]);

  /* ── Load detail ── */
  async function loadDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setDetail(json.data);
        fetch(`/api/portal/cliente/cotizaciones/${id}/view`, { method: "POST" }).catch(() => {});
      }
    } finally {
      setDetailLoading(false);
    }
  }

  /* ── Approve ── */
  async function handleApprove() {
    const id = approveQuoteId;
    if (!id) return;
    const endpoint = isProspect
      ? `/api/portal/cliente/cotizaciones/${id}/accept-proposal`
      : `/api/portal/cliente/cotizaciones/${id}/approve`;

    const res = await fetch(endpoint, { method: "POST" });
    const json = await res.json();
    if (json.success) {
      setQuotes((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: "approved" } : q))
      );
      if (detail?.id === id) {
        setDetail((prev) => prev ? { ...prev, status: "approved" } : prev);
      }
      setApproveQuoteId(null);
      // Show contract form after approval (both prospects and clients)
      setShowContractForm(id);
    } else {
      throw new Error(json.error ?? "Error");
    }
  }

  /* ── Reject ── */
  async function handleReject(reason?: string) {
    const id = rejectQuoteId;
    if (!id) return;
    const res = await fetch(`/api/portal/cliente/cotizaciones/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    const json = await res.json();
    if (json.success) {
      setQuotes((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: "rejected" } : q))
      );
      if (detail?.id === id) {
        setDetail((prev) => prev ? { ...prev, status: "rejected" } : prev);
      }
      setRejectQuoteId(null);
    } else {
      throw new Error(json.error ?? "Error");
    }
  }

  /* ── Get approve dialog quote info ── */
  const approveQuote = approveQuoteId
    ? quotes.find((q) => q.id === approveQuoteId)
    : null;
  const rejectQuote = rejectQuoteId
    ? quotes.find((q) => q.id === rejectQuoteId)
    : null;

  /* ── Render ── */

  // Contract draft view replaces the list
  if (contractDraftQuoteId) {
    return (
      <div className="pb-24">
        <ContratoBorradorView
          quoteId={contractDraftQuoteId}
          onBack={() => setContractDraftQuoteId(null)}
          onNavigateToEmpresa={() => {
            setContractDraftQuoteId(null);
            onNavigate?.("empresa");
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando {isProspect ? "propuestas" : "cotizaciones"}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-status-danger-fg">
        <XCircle className="w-6 h-6" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-status-info-fg" />
        <h2 className="text-base font-semibold">
          {isProspect ? "Propuestas" : "Cotizaciones"}
        </h2>
        <span className="ml-auto text-xs text-zinc-500">
          {quotes.length} cotización{quotes.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Filter tabs */}
      {quotes.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {FILTER_TABS.map((tab) => {
            const count = filterQuotes(quotes, tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  activeTab === tab.key
                    ? "bg-status-info text-white"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10",
                )}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Empty states */}
      {quotes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
          <FileText className="w-10 h-10 opacity-40" />
          {isProspect ? (
            <>
              <p className="text-sm font-medium">Aún no tienes propuestas</p>
              <p className="text-xs text-center max-w-xs">
                Tu ejecutivo comercial está preparando una propuesta personalizada para tu empresa.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No hay cotizaciones activas</p>
              <p className="text-xs text-center max-w-xs">
                ¿Necesitas ampliar o modificar tu servicio?
              </p>
            </>
          )}
          <div className="flex gap-2 mt-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("chat")}
                className="flex items-center gap-2 px-4 h-9 rounded-lg border border-white/10 text-zinc-300 hover:text-white text-sm transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Hablar con ejecutivo
              </button>
            )}
            <WhatsAppButton variant="compact" context={context} />
          </div>
        </div>
      )}

      {filtered.length === 0 && quotes.length > 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
          <p className="text-sm">No hay cotizaciones en esta categoría</p>
        </div>
      )}

      {/* ── Prospect: Deal-grouped view ── */}
      {isProspect && dealGroups.map((group) => {
        const hasMultiple = group.quotes.length > 1;

        return (
          <div key={group.dealId} className="space-y-3">
            {hasMultiple && (
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-300">Oportunidad {group.dealTitle}</h3>
                <span className="text-[10px] text-zinc-600">
                  {group.quotes.length} versión{group.quotes.length !== 1 ? "es" : ""}
                </span>
              </div>
            )}

            {/* All quotes in the group */}
            {group.quotes.map((q) => (
              <div key={q.id} className="space-y-0">
                <CotizacionCard
                  cotizacion={q}
                  detail={expandedId === q.id ? detail : null}
                  detailLoading={expandedId === q.id && detailLoading}
                  variant="full"
                  context="prospect"
                  isExpanded={expandedId === q.id}
                  onToggleExpand={() => loadDetail(q.id)}
                  onApprove={() => setApproveQuoteId(q.id)}
                  onReject={() => setRejectQuoteId(q.id)}
                  onConsult={() => onNavigate?.("chat")}
                  onViewProposal={
                    (() => {
                      const link = (expandedId === q.id && detail?.proposalLink) || q.proposalLink;
                      return link ? () => window.open(link, "_blank") : undefined;
                    })()
                  }
                  onViewContractDraft={() => setContractDraftQuoteId(q.id)}
                />

                {/* Contract form: shown inline after prospect approval */}
                {(showContractForm === q.id || (q.status === "approved" && expandedId === q.id)) && (
                  <div className="mt-2">
                    <PortalContractForm
                      quoteId={q.id}
                      accountName={session.accountName}
                      onComplete={() => setShowContractForm(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* ── Client: Flat list view ── */}
      {!isProspect && filtered.map((quote) => (
        <div key={quote.id} className="space-y-0">
          <CotizacionCard
            cotizacion={quote}
            detail={expandedId === quote.id ? detail : null}
            detailLoading={expandedId === quote.id && detailLoading}
            variant="full"
            context="client"
            isExpanded={expandedId === quote.id}
            onToggleExpand={() => loadDetail(quote.id)}
            onApprove={() => setApproveQuoteId(quote.id)}
            onReject={() => setRejectQuoteId(quote.id)}
            onConsult={() => onNavigate?.("chat")}
            onViewContractDraft={() => setContractDraftQuoteId(quote.id)}
          />

          {/* Contract form: shown inline after client approval */}
          {(showContractForm === quote.id || (quote.status === "approved" && expandedId === quote.id)) && (
            <div className="mt-2">
              <PortalContractForm
                quoteId={quote.id}
                accountName={session.accountName}
                onComplete={() => setShowContractForm(null)}
              />
            </div>
          )}
        </div>
      ))}

      {/* ── Approve dialog ── */}
      {approveQuote && (
        <CotizacionApproveDialog
          quoteId={approveQuote.id}
          quoteName={approveQuote.quoteName ?? approveQuote.name ?? approveQuote.code}
          monthlyCost={approveQuote.monthlyCost}
          currency={approveQuote.currency}
          open={!!approveQuoteId}
          onOpenChange={(open) => { if (!open) setApproveQuoteId(null); }}
          onConfirm={handleApprove}
          onNavigateToEmpresa={() => {
            setApproveQuoteId(null);
            onNavigate?.("empresa");
          }}
          isProspect={isProspect}
        />
      )}

      {/* ── Reject dialog ── */}
      {rejectQuote && (
        <CotizacionRejectDialog
          quoteName={rejectQuote.quoteName ?? rejectQuote.name ?? rejectQuote.code}
          open={!!rejectQuoteId}
          onOpenChange={(open) => { if (!open) setRejectQuoteId(null); }}
          onConfirm={handleReject}
        />
      )}
    </div>
  );
}
