"use client";

import { useState } from "react";
import {
  ChevronDown, ChevronUp, FileDown, FileText, MessageSquare,
  Loader2, AlertTriangle, Check, XCircle, Paperclip, Download, ExternalLink,
  BarChart3,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  QuoteSummary, QuoteDetail,
  STATUS_BADGE, STATUS_LABEL,
  formatDate, formatHorario, formatWeekdays,
  seemsCurrencyWrong, getDisplayStatus, isActionable,
} from "./types";
import { GardServiceIncludes } from "./GardServiceIncludes";
import { WhatsAppButton } from "./WhatsAppButton";
import { QuoteBreakdownPanel } from "@/components/cpq/QuoteBreakdownPanel";
import { CostBreakdownPortal } from "./CostBreakdownPortal";
import { CompliancePortal } from "./CompliancePortal";
import { AdditionalServicesPortal } from "./AdditionalServicesPortal";

/* ══════════════════════════════════════════════════════ */

interface CotizacionCardProps {
  cotizacion: QuoteSummary;
  detail?: QuoteDetail | null;
  detailLoading?: boolean;
  variant: "dashboard" | "full";
  context: "prospect" | "client";
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onConsult?: () => void;
  onViewProposal?: () => void;
  className?: string;
}

export function CotizacionCard({
  cotizacion,
  detail,
  detailLoading,
  variant,
  context,
  isExpanded,
  onToggleExpand,
  onApprove,
  onReject,
  onConsult,
  onViewProposal,
  className,
}: CotizacionCardProps) {
  const displayStatus = getDisplayStatus(cotizacion);
  const statusBadge = STATUS_BADGE[displayStatus] ?? STATUS_BADGE.draft;
  const statusLabel = STATUS_LABEL[displayStatus] ?? cotizacion.status;
  const canAct = isActionable(cotizacion);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  async function handleDownloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${cotizacion.id}/pdf`);
      if (!res.ok) throw new Error("Error al generar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `cotizacion-${cotizacion.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silent — PDF generation may not be available
    } finally {
      setPdfLoading(false);
    }
  }

  /* ── Dashboard variant ── */
  if (variant === "dashboard") {
    return (
      <div
        className={cn(
          "rounded-xl border border-white/[0.06] overflow-hidden transition-all hover:border-teal-500/30",
          className,
        )}
        style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)" }}
      >
        <button
          onClick={onToggleExpand}
          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusBadge)}>
                {statusLabel}
              </span>
              <span className="text-sm font-semibold truncate">
                {cotizacion.name ?? cotizacion.code}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              <span className="text-sm font-semibold text-teal-400">
                {formatCurrency(cotizacion.monthlyCost, cotizacion.currency === "UF" ? "UF" : "CLP")}
                <span className="text-xs font-normal text-zinc-500"> /mes</span>
                {seemsCurrencyWrong(cotizacion.monthlyCost, cotizacion.currency) && (
                  <span className="inline-flex items-center gap-0.5 ml-1.5 text-[10px] text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                )}
              </span>
              <span className="text-xs text-zinc-600">
                {cotizacion.totalPositions} puesto{cotizacion.totalPositions !== 1 ? "s" : ""} · {cotizacion.totalGuards} guardia{cotizacion.totalGuards !== 1 ? "s" : ""}
              </span>
              {cotizacion.validUntil && (
                <span className="text-xs text-zinc-500">
                  Válida hasta {formatDate(cotizacion.validUntil)}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-teal-400 shrink-0 mt-1">Ver detalle →</span>
        </button>
      </div>
    );
  }

  /* ── Full variant ── */
  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden transition-all",
        canAct
          ? "border border-teal-500/30 shadow-lg shadow-teal-500/5"
          : "border border-white/[0.06]",
        "hover:border-teal-500/30",
        className,
      )}
      style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)" }}
    >
      {/* Card header — clickable */}
      <button
        onClick={onToggleExpand}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">
              {cotizacion.name ?? cotizacion.code}
            </span>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusBadge)}>
              {statusLabel}
            </span>
            {canAct && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-900/40 text-teal-300">
                Requiere acción
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{cotizacion.code}</p>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <span className="text-sm font-semibold text-teal-400">
              {formatCurrency(cotizacion.monthlyCost, cotizacion.currency === "UF" ? "UF" : "CLP")}
              <span className="text-xs font-normal text-zinc-500"> /mes</span>
              {seemsCurrencyWrong(cotizacion.monthlyCost, cotizacion.currency) && (
                <span className="inline-flex items-center gap-0.5 ml-1.5 text-[10px] text-amber-400" title="El monto parece no corresponder a la moneda indicada">
                  <AlertTriangle className="h-3 w-3" />
                  Verificar moneda
                </span>
              )}
            </span>
            {cotizacion.validUntil && (
              <span className="text-xs text-zinc-500">
                Válida hasta {formatDate(cotizacion.validUntil)}
              </span>
            )}
            <span className="text-xs text-zinc-600">
              {cotizacion.totalPositions} puesto{cotizacion.totalPositions !== 1 ? "s" : ""} · {cotizacion.totalGuards} guardia{cotizacion.totalGuards !== 1 ? "s" : ""}
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

          {detail && (() => {
            const sec = detail.templateSections;
            const isDetailed = sec?.showCostBreakdown === true;
            const isTender = sec?.showComplianceSection === true;
            const currencyKey = detail.currency === "UF" ? "UF" : "CLP";
            let sectionCounter = 0;

            return (
            <>
              {/* Service detail / AI description */}
              {(detail.serviceDetail || detail.aiDescription) && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {isTender ? `${++sectionCounter}. ` : ""}Detalle del servicio
                    </h4>
                    {detail.aiDescription && (
                      <span className="text-[10px] uppercase tracking-wider bg-teal-500/10 text-teal-400/70 rounded-full px-2 py-0.5 font-medium">
                        Análisis OPAI AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                    {detail.serviceDetail ?? detail.aiDescription}
                  </p>
                </div>
              )}

              {/* Gard service includes */}
              <GardServiceIncludes variant="full" />

              {/* Positions table */}
              {detail.positions.length > 0 && (
                <div className="space-y-1">
                  {isTender && (
                    <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {++sectionCounter}. Dotación
                    </h4>
                  )}
                  {/* Mobile: card view */}
                  <div className="md:hidden space-y-2">
                    {detail.positions.map((pos) => (
                      <div key={pos.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
                        <div className="text-xs font-medium text-zinc-200">{pos.customName ?? `Puesto ${pos.numPuestos ?? ""}`}</div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-500">Guardias: {pos.numGuards ?? "—"}</span>
                          <span className="text-teal-400 font-medium">{formatCurrency(pos.displayPrice ?? pos.monthlyPositionCost, currencyKey)}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {formatHorario(pos.startTime, pos.endTime)} · {formatWeekdays(pos.weekdays)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop: table view */}
                  <div className="hidden md:block overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-xs min-w-[480px]">
                      <thead>
                        <tr className="text-zinc-500 border-b border-white/[0.06]">
                          <th className="text-left py-2 pr-3 font-medium">Descripción</th>
                          <th className="text-center py-2 pr-3 font-medium">Guardias</th>
                          <th className="text-left py-2 pr-3 font-medium">Horario</th>
                          <th className="text-left py-2 pr-3 font-medium">Días</th>
                          <th className="text-right py-2 font-medium">Precio mensual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.positions.map((pos) => (
                          <tr key={pos.id} className="border-b border-white/[0.03] last:border-0">
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
                              {formatWeekdays(pos.weekdays)}
                            </td>
                            <td className="py-2 text-right text-teal-400 font-medium">
                              {formatCurrency(pos.displayPrice ?? pos.monthlyPositionCost, currencyKey)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cost breakdown by category — Detailed / Tender templates */}
              {isDetailed && detail.costsByCategory && detail.costsByCategory.length > 0 && (
                <CostBreakdownPortal
                  categories={detail.costsByCategory}
                  currency={currencyKey}
                  numbered={isTender}
                />
              )}

              {/* Additional services — enhanced display */}
              {detail.additionalLines && detail.additionalLines.length > 0 && (
                <AdditionalServicesPortal
                  lines={detail.additionalLines}
                  currency={currencyKey}
                />
              )}

              {/* Compliance — Tender template only */}
              {isTender && (
                <CompliancePortal
                  numbered={true}
                  sectionNumber={++sectionCounter}
                />
              )}

              {/* Condiciones Comerciales */}
              {(detail.paymentTerms || detail.contractDuration || detail.serviceStartDays) && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    {isTender ? `${++sectionCounter}. ` : ""}Condiciones Comerciales
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {detail.validUntil && (
                      <div className="rounded-md bg-white/[0.04] px-3 py-2">
                        <p className="text-[10px] text-zinc-500">Vigencia</p>
                        <p className="text-xs text-zinc-200 font-medium">{formatDate(detail.validUntil)}</p>
                      </div>
                    )}
                    {detail.paymentTerms && (
                      <div className="rounded-md bg-white/[0.04] px-3 py-2">
                        <p className="text-[10px] text-zinc-500">Forma de pago</p>
                        <p className="text-xs text-zinc-200 font-medium capitalize">{detail.paymentTerms.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    {detail.serviceStartDays != null && (
                      <div className="rounded-md bg-white/[0.04] px-3 py-2">
                        <p className="text-[10px] text-zinc-500">Inicio del servicio</p>
                        <p className="text-xs text-zinc-200 font-medium">{detail.serviceStartDays} días hábiles</p>
                      </div>
                    )}
                    {detail.contractDuration != null && (
                      <div className="rounded-md bg-white/[0.04] px-3 py-2">
                        <p className="text-[10px] text-zinc-500">Duración del contrato</p>
                        <p className="text-xs text-zinc-200 font-medium">{detail.contractDuration} meses</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Included items */}
              {detail.includedItems && detail.includedItems.length > 0 && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    {isTender ? `${++sectionCounter}. ` : ""}El servicio incluye
                  </h4>
                  <ul className="space-y-1">
                    {detail.includedItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                        <span className="text-teal-400 mt-0.5 shrink-0">●</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Notes */}
              {detail.notes && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                    Notas
                  </h4>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">{detail.notes}</p>
                </div>
              )}

              {/* Total card */}
              <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">
                  {isTender ? `${++sectionCounter}. ` : ""}Total mensual
                </span>
                <span className="text-sm font-bold text-teal-300">
                  {formatCurrency(detail.monthlyCost, currencyKey)}
                </span>
              </div>

              {detail.positions.length === 0 && !detail.additionalLines?.length && (
                <p className="text-xs text-zinc-500">Sin posiciones detalladas.</p>
              )}

              {/* Documentos adjuntos */}
              {detail.attachments && detail.attachments.length > 0 && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" />
                    Documentos adjuntos
                  </h4>
                  <ul className="space-y-1.5">
                    {detail.attachments.map((att) => (
                      <li
                        key={att.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-white/[0.04] px-2.5 py-2 text-xs"
                      >
                        <span className="truncate text-zinc-300 font-medium">{att.fileName}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {att.publicUrl && (
                            <>
                              <a
                                href={att.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Ver
                              </a>
                              <a
                                href={att.publicUrl}
                                download={att.fileName}
                                className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Descargar
                              </a>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cost breakdown — full transparent (always if available) */}
              {detail.costBreakdown && (
                <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowBreakdown((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-teal-400" />
                      <span className="text-sm font-semibold text-teal-300">
                        Estructura de costos
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium">
                        Transparente
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-zinc-500 transition-transform",
                        showBreakdown ? "rotate-180" : "",
                      )}
                    />
                  </button>
                  {showBreakdown && (
                    <div className="border-t border-white/[0.06] px-4 py-4">
                      <QuoteBreakdownPanel
                        data={detail.costBreakdown}
                        variant="dark"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {canAct && onApprove && (
                  <button
                    type="button"
                    onClick={onApprove}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}
                  >
                    <Check className="w-4 h-4" />
                    {context === "prospect" ? "Aceptar propuesta" : "Aprobar cotización"}
                  </button>
                )}

                {canAct && onReject && (
                  <button
                    type="button"
                    onClick={onReject}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg border border-red-700/50 text-red-400 hover:bg-red-500/10 text-sm transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Rechazar
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="flex items-center gap-2 px-4 h-9 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 text-sm transition-colors disabled:opacity-50"
                >
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {pdfLoading ? "Generando..." : "Descargar PDF"}
                </button>

                {onViewProposal && (
                  <button
                    type="button"
                    onClick={onViewProposal}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: "linear-gradient(135deg, rgba(20,184,166,0.18), rgba(6,182,212,0.12))",
                      border: "1px solid rgba(45,212,191,0.4)",
                      color: "#5eead4",
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    Propuesta técnica
                  </button>
                )}

                {onConsult && (
                  <button
                    type="button"
                    onClick={onConsult}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 text-sm transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Consultar
                  </button>
                )}

                <WhatsAppButton
                  variant="compact"
                  context={context}
                  cotizacionCode={cotizacion.code}
                />
              </div>

              {/* Brand footer */}
              <div className="text-center pt-3 border-t border-white/[0.04]">
                <p className="text-[10px] text-zinc-600">
                  Propuesta generada en plataforma OPAI ·{" "}
                  <a
                    href="https://lx3.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-zinc-400 transition-colors"
                  >
                    lx3.ai
                  </a>
                </p>
              </div>
            </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
