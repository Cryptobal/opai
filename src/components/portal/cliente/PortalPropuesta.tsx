"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileDown, Check, MessageSquare, ChevronDown, ChevronUp,
  FileText, Loader2, XCircle, AlertTriangle, Eye,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

/* ── Types ── */

type QuoteSummary = {
  id: string;
  code: string;
  status: string;
  name: string | null;
  monthlyCost: number;
  currency: string;
  totalPositions: number;
  totalGuards: number;
  dealId: string | null;
  dealTitle: string | null;
  proposalLink: string | null;
  validUntil: string | null;
  createdAt: string;
};

type Position = {
  id: string;
  customName: string | null;
  numGuards: number | null;
  numPuestos: number | null;
  startTime: string | null;
  endTime: string | null;
  weekdays: string | null;
  monthlyPositionCost: number;
};

type AdditionalLine = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  orden: number;
};

type QuoteDetail = QuoteSummary & {
  positions: Position[];
  additionalLines?: AdditionalLine[];
  notes: string | null;
  aiDescription: string | null;
  serviceDetail: string | null;
};

type DealGroup = {
  dealId: string;
  dealTitle: string;
  quotes: QuoteSummary[];
};

/* ── Status config ── */

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-zinc-800 text-zinc-400",
  sent:     "bg-blue-900/60 text-blue-300",
  pending:  "bg-yellow-900/60 text-yellow-300",
  approved: "bg-emerald-900/60 text-emerald-300",
  rejected: "bg-red-900/60 text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  draft:    "Borrador",
  sent:     "Enviada",
  pending:  "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

/* ── Helpers ── */

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatHorario(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${start ?? ""}–${end ?? ""}`;
}

const FULL_WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAYS_ONLY = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const WEEKEND_ONLY = ["Sáb", "Dom"];

function formatWeekdays(days: string[] | string | null): string {
  if (!days) return "—";
  const arr = Array.isArray(days) ? days : [days];
  if (arr.length === 0) return "—";
  if (arr.length === 7 || FULL_WEEK.every((d) => arr.includes(d))) return "Lun-Dom";
  if (arr.length === 5 && WEEKDAYS_ONLY.every((d) => arr.includes(d))) return "Lun-Vie";
  if (arr.length === 2 && WEEKEND_ONLY.every((d) => arr.includes(d))) return "Sáb-Dom";
  if (arr.length === 6 && WEEKDAYS_ONLY.every((d) => arr.includes(d)) && arr.includes("Sáb")) return "Lun-Sáb";
  return arr.join(", ");
}

function seemsCurrencyWrong(amount: number, currency: string): boolean {
  return (currency === "UF" && amount > 5000) || (currency === "CLP" && amount > 0 && amount < 1000);
}

/* ══════════════════════════════════════════════════════ */

interface Props {
  isProspect?: boolean;
  onNavigate?: (section: string) => void;
}

export function PortalPropuesta({ isProspect, onNavigate }: Props) {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [collapsedDeals, setCollapsedDeals] = useState<Set<string>>(new Set());

  // Accept-proposal modal
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptResult, setAcceptResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /* ── Load quotes ── */
  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setQuotes(json.data);
        else setError(json.error ?? "Error al cargar propuestas");
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }, []);

  /* ── Group by deal ── */
  const dealGroups = useMemo<DealGroup[]>(() => {
    const map = new Map<string, DealGroup>();
    for (const q of quotes) {
      const key = q.dealId ?? `no-deal-${q.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.quotes.push(q);
      } else {
        map.set(key, {
          dealId: key,
          dealTitle: q.dealTitle ?? q.name ?? q.code,
          quotes: [q],
        });
      }
    }
    // Sort quotes within each group: active (sent/pending) first, then by date desc
    for (const group of map.values()) {
      group.quotes.sort((a, b) => {
        const activeStatuses = ["sent", "pending"];
        const aActive = activeStatuses.includes(a.status) ? 0 : 1;
        const bActive = activeStatuses.includes(b.status) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return Array.from(map.values());
  }, [quotes]);

  /* ── Load detail ── */
  async function loadDetail(id: string) {
    if (expandedQuoteId === id) {
      setExpandedQuoteId(null);
      setDetail(null);
      return;
    }
    setExpandedQuoteId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}`);
      const json = await res.json();
      if (json.success) setDetail(json.data);
    } finally {
      setDetailLoading(false);
    }
  }

  /* ── Accept proposal ── */
  async function handleAcceptProposal(id: string) {
    setAcceptLoading(true);
    setAcceptResult(null);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}/accept-proposal`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setQuotes((prev) =>
          prev.map((q) => (q.id === id ? { ...q, status: "approved" } : q))
        );
        if (detail?.id === id) {
          setDetail((prev) => prev ? { ...prev, status: "approved" } : prev);
        }
        setAcceptResult({ type: "success", message: "Propuesta aceptada exitosamente" });
        setTimeout(() => {
          setConfirmAcceptId(null);
          setAcceptResult(null);
        }, 2000);
      } else {
        setAcceptResult({ type: "error", message: json.error ?? "Error al aceptar la propuesta" });
      }
    } catch {
      setAcceptResult({ type: "error", message: "Error de conexion" });
    } finally {
      setAcceptLoading(false);
    }
  }

  /* ── PDF download ── */
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  async function handleDownloadPdf(id: string) {
    if (pdfLoading) return;
    setPdfLoading(id);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}/pdf`);
      if (!res.ok) throw new Error("Error al generar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `cotizacion-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("No se pudo descargar el PDF. Intente nuevamente.");
    } finally {
      setPdfLoading(null);
    }
  }

  /* ── Toggle deal collapse ── */
  function toggleDealCollapse(dealId: string) {
    setCollapsedDeals((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando propuestas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-red-400">
        <XCircle className="w-6 h-6" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-24 space-y-6 px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-teal-400" />
        <h2 className="text-base font-semibold">Propuestas</h2>
        <span className="ml-auto text-xs text-zinc-500">
          {quotes.length} cotizacion{quotes.length !== 1 ? "es" : ""}
        </span>
      </div>

      {quotes.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-zinc-500">
          <FileText className="w-8 h-8" />
          <p className="text-sm">No hay propuestas disponibles</p>
        </div>
      )}

      {/* Deal groups */}
      {dealGroups.map((group) => {
        const hasMultipleQuotes = group.quotes.length > 1;
        const isCollapsed = collapsedDeals.has(group.dealId);
        const activeQuote = group.quotes[0]; // First quote is active (sorted above)
        const olderQuotes = group.quotes.slice(1);
        const isActiveStatus = ["sent", "pending"].includes(activeQuote.status);

        return (
          <div key={group.dealId} className="space-y-3">
            {/* Deal title header (only if multiple quotes or has deal title) */}
            {hasMultipleQuotes && (
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-300">{group.dealTitle}</h3>
                <span className="text-[10px] text-zinc-600">
                  {group.quotes.length} version{group.quotes.length !== 1 ? "es" : ""}
                </span>
              </div>
            )}

            {/* Active quote card */}
            <QuoteCard
              quote={activeQuote}
              isActive={isActiveStatus}
              isExpanded={expandedQuoteId === activeQuote.id}
              detail={expandedQuoteId === activeQuote.id ? detail : null}
              detailLoading={expandedQuoteId === activeQuote.id && detailLoading}
              isProspect={isProspect}
              onToggleExpand={() => loadDetail(activeQuote.id)}
              onDownloadPdf={() => handleDownloadPdf(activeQuote.id)}
              pdfLoading={pdfLoading === activeQuote.id}
              onViewProposal={(() => {
                const link = (expandedQuoteId === activeQuote.id && detail?.proposalLink) || activeQuote.proposalLink;
                return link ? () => window.open(link, "_blank") : undefined;
              })()}
              onAccept={() => setConfirmAcceptId(activeQuote.id)}
              onConsult={() => onNavigate?.("chat")}
            />

            {/* Older quotes (collapsed by default) */}
            {hasMultipleQuotes && olderQuotes.length > 0 && (
              <>
                <button
                  onClick={() => toggleDealCollapse(group.dealId)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
                >
                  {isCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                  {isCollapsed
                    ? `Ver ${olderQuotes.length} version${olderQuotes.length !== 1 ? "es" : ""} anterior${olderQuotes.length !== 1 ? "es" : ""}`
                    : "Ocultar versiones anteriores"}
                </button>

                {!isCollapsed && (
                  <div className="space-y-2 ml-3 border-l border-zinc-800 pl-3">
                    {olderQuotes.map((q) => (
                      <QuoteCard
                        key={q.id}
                        quote={q}
                        isActive={false}
                        isExpanded={expandedQuoteId === q.id}
                        detail={expandedQuoteId === q.id ? detail : null}
                        detailLoading={expandedQuoteId === q.id && detailLoading}
                        isProspect={isProspect}
                        onToggleExpand={() => loadDetail(q.id)}
                        onDownloadPdf={() => handleDownloadPdf(q.id)}
                        pdfLoading={pdfLoading === q.id}
                        onViewProposal={(() => {
                          const link = (expandedQuoteId === q.id && detail?.proposalLink) || q.proposalLink;
                          return link ? () => window.open(link, "_blank") : undefined;
                        })()}
                        onAccept={() => setConfirmAcceptId(q.id)}
                        onConsult={() => onNavigate?.("chat")}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* ── Accept confirmation modal ── */}
      {confirmAcceptId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4"
            style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)" }}
          >
            {acceptResult?.type === "success" ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-900/40 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-emerald-300">{acceptResult.message}</p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-900/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Aceptar propuesta
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Al aceptar esta propuesta, nuestro equipo iniciara el proceso
                      de contratacion y te contactara para coordinar los detalles.
                    </p>
                  </div>
                </div>

                {acceptResult?.type === "error" && (
                  <div className="rounded-lg bg-red-900/20 border border-red-800/40 p-3">
                    <p className="text-xs text-red-400">{acceptResult.message}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleAcceptProposal(confirmAcceptId)}
                    disabled={acceptLoading}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}
                  >
                    {acceptLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Confirmar
                  </button>
                  <button
                    onClick={() => {
                      setConfirmAcceptId(null);
                      setAcceptResult(null);
                    }}
                    disabled={acceptLoading}
                    className="px-4 h-10 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/* ── QuoteCard sub-component ── */
/* ══════════════════════════════════════════════════════ */

function QuoteCard({
  quote,
  isActive,
  isExpanded,
  detail,
  detailLoading,
  isProspect,
  onToggleExpand,
  onDownloadPdf,
  pdfLoading,
  onViewProposal,
  onAccept,
  onConsult,
}: {
  quote: QuoteSummary;
  isActive: boolean;
  isExpanded: boolean;
  detail: QuoteDetail | null;
  detailLoading: boolean;
  isProspect?: boolean;
  onToggleExpand: () => void;
  onDownloadPdf: () => void;
  pdfLoading?: boolean;
  onViewProposal?: () => void;
  onAccept: () => void;
  onConsult: () => void;
}) {
  const statusBadge = STATUS_BADGE[quote.status] ?? STATUS_BADGE.draft;
  const statusLabel = STATUS_LABEL[quote.status] ?? quote.status;
  const canAccept = isProspect && ["sent", "pending"].includes(quote.status);

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden transition-all",
        isActive
          ? "border border-teal-500/30 shadow-lg shadow-teal-500/5"
          : "border border-white/[0.06]",
        "hover:border-teal-500/30"
      )}
      style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)" }}
    >
      {/* Card header */}
      <button
        onClick={onToggleExpand}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">
              {quote.name ?? quote.code}
            </span>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusBadge)}>
              {statusLabel}
            </span>
            {isActive && ["sent", "pending"].includes(quote.status) && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-900/40 text-teal-300">
                Activa
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{quote.code}</p>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <span className="text-sm font-semibold text-teal-400">
              {formatCurrency(quote.monthlyCost, quote.currency === "UF" ? "UF" : "CLP")}
              <span className="text-xs font-normal text-zinc-500">/mes</span>
              {seemsCurrencyWrong(quote.monthlyCost, quote.currency) && (
                <span className="inline-flex items-center gap-0.5 ml-1.5 text-[10px] text-amber-400" title="El monto parece no corresponder a la moneda indicada">
                  <AlertTriangle className="h-3 w-3" />
                  Verificar moneda
                </span>
              )}
            </span>
            <span className="text-xs text-zinc-600">
              {quote.totalPositions} puesto{quote.totalPositions !== 1 ? "s" : ""} · {quote.totalGuards} guardia{quote.totalGuards !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-zinc-500" />
            : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
          {detailLoading && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando detalle...
            </div>
          )}

          {detail && (
            <>
              {/* AI description / service detail */}
              {(detail.serviceDetail || detail.aiDescription) && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Detalle del servicio</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                    {detail.serviceDetail ?? detail.aiDescription}
                  </p>
                </div>
              )}

              {/* Positions table */}
              {(detail.positions.length > 0 || (detail.additionalLines && detail.additionalLines.length > 0)) && (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead>
                      <tr className="text-zinc-500 border-b border-white/[0.06]">
                        <th className="text-left py-2 pr-3 font-medium">Descripción</th>
                        <th className="text-center py-2 pr-3 font-medium">Guardias</th>
                        <th className="text-left py-2 pr-3 font-medium">Horario</th>
                        <th className="text-left py-2 pr-3 font-medium">Días</th>
                        <th className="text-right py-2 font-medium">Costo mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.positions.map((pos) => (
                        <tr key={pos.id} className="border-b border-white/[0.03] last:border-0">
                          <td className="py-2 pr-3 text-zinc-200">
                            {pos.customName ?? `Puesto ${pos.numPuestos ?? ""}`}
                          </td>
                          <td className="py-2 pr-3 text-center text-zinc-300">
                            {pos.numGuards ?? ""}
                          </td>
                          <td className="py-2 pr-3 text-zinc-400">
                            {formatHorario(pos.startTime, pos.endTime)}
                          </td>
                          <td className="py-2 pr-3 text-zinc-400">
                            {formatWeekdays(pos.weekdays)}
                          </td>
                          <td className="py-2 text-right text-teal-400 font-medium">
                            {formatCurrency(pos.monthlyPositionCost, detail.currency === "UF" ? "UF" : "CLP")}
                          </td>
                        </tr>
                      ))}
                      {detail.additionalLines?.map((line) => (
                        <tr key={line.id} className="border-b border-white/[0.03] last:border-0">
                          <td className="py-2 pr-3 text-zinc-200" colSpan={1}>
                            {line.nombre}
                            {line.descripcion && (
                              <span className="block text-[10px] text-zinc-500 mt-0.5">{line.descripcion}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-center text-zinc-500">—</td>
                          <td className="py-2 pr-3 text-zinc-500">—</td>
                          <td className="py-2 pr-3 text-zinc-500">—</td>
                          <td className="py-2 text-right text-teal-400 font-medium">
                            {formatCurrency(line.precio, detail.currency === "UF" ? "UF" : "CLP")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-700">
                        <td colSpan={4} className="py-2 pr-3 text-xs font-semibold text-zinc-400">
                          Total mensual
                        </td>
                        <td className="py-2 text-right text-sm font-bold text-teal-300">
                          {formatCurrency(detail.monthlyCost, detail.currency === "UF" ? "UF" : "CLP")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {detail.positions.length === 0 && (
                <p className="text-xs text-zinc-500">Sin posiciones detalladas.</p>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={onDownloadPdf}
                  disabled={pdfLoading}
                  className="flex items-center gap-2 px-4 h-9 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 text-sm transition-colors disabled:opacity-50"
                >
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {pdfLoading ? "Generando..." : "Descargar PDF"}
                </button>

                {onViewProposal && (
                  <button
                    onClick={onViewProposal}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg border border-teal-500/30 text-teal-300 hover:text-teal-200 hover:border-teal-500/50 text-sm transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Ver propuesta técnica
                  </button>
                )}

                {canAccept && (
                  <button
                    onClick={onAccept}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}
                  >
                    <Check className="w-4 h-4" />
                    Aceptar propuesta
                  </button>
                )}

                <button
                  onClick={onConsult}
                  className="flex items-center gap-2 px-4 h-9 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 text-sm transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Consultar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
