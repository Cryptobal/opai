"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Loader2, AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PortalContractForm } from "./PortalContractForm";

/* ── Types ── */

type QuoteSummary = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  monthlyCost: number;
  validUntil: string | null;
  totalPositions: number;
  totalGuards: number;
  currency: string;
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

type QuoteDetail = QuoteSummary & {
  positions: Position[];
  notes: string | null;
  aiDescription: string | null;
};

/* ── Status config ── */

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-zinc-800 text-zinc-400",
  sent:     "bg-blue-900/60 text-blue-300",
  approved: "bg-emerald-900/60 text-emerald-300",
  rejected: "bg-red-900/60 text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  draft:    "Borrador",
  sent:     "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

/* ── Helpers ── */

function formatDate(d: string | null): string {
  if (!d) return "—";
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

function seemsCurrencyWrong(amount: number, currency: string): boolean {
  return (currency === "UF" && amount > 5000) || (currency === "CLP" && amount > 0 && amount < 1000);
}

/* ══════════════════════════════════════════════════════ */

interface Props {
  session: ClienteSession;
}

export function PortalCotizaciones({ session }: Props) {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);

  const [showContractForm, setShowContractForm] = useState<string | null>(null);

  /* ── Load list ── */
  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setQuotes(json.data);
        else setError(json.error ?? "Error al cargar cotizaciones");
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }, []);

  /* ── Load detail ── */
  async function loadDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setShowRejectInput(false);
      setConfirmingApprove(false);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    setShowRejectInput(false);
    setConfirmingApprove(false);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}`);
      const json = await res.json();
      if (json.success) setDetail(json.data);
    } finally {
      setDetailLoading(false);
    }
  }

  /* ── Approve ── */
  async function handleApprove(id: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}/approve`, {
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
        setConfirmingApprove(false);
        setShowContractForm(id);
      }
    } finally {
      setActionLoading(false);
    }
  }

  /* ── Reject ── */
  async function handleReject(id: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setQuotes((prev) =>
          prev.map((q) => (q.id === id ? { ...q, status: "rejected" } : q))
        );
        if (detail?.id === id) {
          setDetail((prev) => prev ? { ...prev, status: "rejected" } : prev);
        }
        setShowRejectInput(false);
        setRejectReason("");
      }
    } finally {
      setActionLoading(false);
    }
  }

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando cotizaciones...</span>
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
    <div className="pb-24 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-teal-400" />
        <h2 className="text-base font-semibold">Cotizaciones</h2>
        <span className="ml-auto text-xs text-zinc-500">{quotes.length} cotizacion{quotes.length !== 1 ? "es" : ""}</span>
      </div>

      {quotes.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-zinc-500">
          <FileText className="w-8 h-8" />
          <p className="text-sm">No hay cotizaciones disponibles</p>
        </div>
      )}

      {quotes.map((quote) => {
        const isExpanded = expandedId === quote.id;
        const statusBadge = STATUS_BADGE[quote.status] ?? STATUS_BADGE.draft;
        const statusLabel = STATUS_LABEL[quote.status] ?? quote.status;

        return (
          <div
            key={quote.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
          >
            {/* Card header — clickable */}
            <button
              onClick={() => loadDetail(quote.id)}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">
                    {quote.name ?? quote.code}
                  </span>
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusBadge)}>
                    {statusLabel}
                  </span>
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
                  {quote.validUntil && (
                    <span className="text-xs text-zinc-500">
                      Valida hasta {formatDate(quote.validUntil)}
                    </span>
                  )}
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
              <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                {detailLoading && (
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando detalle...
                  </div>
                )}

                {detail && (
                  <>
                    {/* Positions table */}
                    {detail.positions.length > 0 && (
                      <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-xs min-w-[480px]">
                          <thead>
                            <tr className="text-zinc-500 border-b border-zinc-800">
                              <th className="text-left py-2 pr-3 font-medium">Puesto</th>
                              <th className="text-center py-2 pr-3 font-medium">Guardias</th>
                              <th className="text-left py-2 pr-3 font-medium">Horario</th>
                              <th className="text-left py-2 pr-3 font-medium">Dias</th>
                              <th className="text-right py-2 font-medium">Costo mensual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.positions.map((pos) => (
                              <tr key={pos.id} className="border-b border-zinc-800/50 last:border-0">
                                <td className="py-2 pr-3 text-zinc-200">
                                  {pos.customName ?? `Puesto ${pos.numPuestos ?? ""}`}
                                </td>
                                <td className="py-2 pr-3 text-center text-zinc-300">
                                  {pos.numGuards ?? "—"}
                                </td>
                                <td className="py-2 pr-3 text-zinc-400">
                                  {formatHorario(pos.startTime, pos.endTime)}
                                </td>
                                <td className="py-2 pr-3 text-zinc-400">
                                  {pos.weekdays ?? "—"}
                                </td>
                                <td className="py-2 text-right text-teal-400 font-medium">
                                  {formatCurrency(pos.monthlyPositionCost, detail.currency === "UF" ? "UF" : "CLP")}
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

                    {/* Actions for sent quotes */}
                    {detail.status === "sent" && (
                      <div className="space-y-3 pt-2">
                        {!showRejectInput && !confirmingApprove && (
                          <div className="flex gap-3">
                            <button
                              onClick={() => setConfirmingApprove(true)}
                              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Aprobar cotizacion
                            </button>
                            <button
                              onClick={() => setShowRejectInput(true)}
                              className="px-4 h-10 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 text-sm transition-colors"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}

                        {confirmingApprove && (
                          <div className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-4 space-y-3">
                            <p className="text-sm text-emerald-300 font-medium">
                              Confirmar aprobacion
                            </p>
                            <p className="text-xs text-zinc-400">
                              Al aprobar esta cotizacion, nuestro equipo iniciara el proceso de
                              contratacion y te contactara para coordinar los detalles.
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprove(detail.id)}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-4 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                              >
                                {actionLoading
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <CheckCircle className="w-3.5 h-3.5" />}
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmingApprove(false)}
                                disabled={actionLoading}
                                className="px-4 h-9 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {showRejectInput && (
                          <div className="rounded-lg border border-red-800/50 bg-red-900/10 p-4 space-y-3">
                            <p className="text-sm text-red-400 font-medium">Rechazar cotizacion</p>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Motivo de rechazo (opcional)..."
                              rows={2}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600 resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReject(detail.id)}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-4 h-9 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                              >
                                {actionLoading
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <XCircle className="w-3.5 h-3.5" />}
                                Rechazar
                              </button>
                              <button
                                onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                                disabled={actionLoading}
                                className="px-4 h-9 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Approved: show contract form */}
                    {(detail.status === "approved" || showContractForm === detail.id) && (
                      <PortalContractForm
                        quoteId={detail.id}
                        accountName={session.accountName}
                        onComplete={() => setShowContractForm(null)}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
