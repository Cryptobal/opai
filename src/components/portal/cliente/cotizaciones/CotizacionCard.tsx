"use client";

import { useState } from "react";
import {
  ChevronDown, ChevronUp, Loader2, AlertTriangle,
  Paperclip, Download, ExternalLink,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  QuoteSummary, QuoteDetail,
  STATUS_BADGE, STATUS_LABEL,
  formatDate, seemsCurrencyWrong, getDisplayStatus, isActionable,
} from "./types";
import { ProposalHeader } from "./ProposalHeader";
import { ProposalPuestos } from "./ProposalPuestos";
import { ProposalManoDeObra } from "./ProposalManoDeObra";
import { CompliancePortal } from "./CompliancePortal";
import { ProposalCondiciones } from "./ProposalCondiciones";
import { ProposalServicioIncluye } from "./ProposalServicioIncluye";
import { ProposalDetalleServicio } from "./ProposalDetalleServicio";
import { ProposalTecnologia } from "./ProposalTecnologia";
import { ProposalEstructuraCostos } from "./ProposalEstructuraCostos";
import { ProposalDesgloseRecursos } from "./ProposalDesgloseRecursos";
import { ProposalTotalAcciones } from "./ProposalTotalAcciones";

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
  onViewContractDraft?: () => void;
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
  onViewContractDraft,
  className,
}: CotizacionCardProps) {
  const displayStatus = getDisplayStatus(cotizacion);
  const statusBadge = STATUS_BADGE[displayStatus] ?? STATUS_BADGE.draft;
  const statusLabel = STATUS_LABEL[displayStatus] ?? cotizacion.status;
  const canAct = isActionable(cotizacion);

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
                {cotizacion.clientName ?? cotizacion.name ?? cotizacion.code}
              </span>
            </div>
            {(cotizacion.installationName || cotizacion.quoteName) && (
              <div className="mt-0.5 space-y-0.5">
                {cotizacion.installationName && (
                  <p className="text-xs text-zinc-500 truncate">{cotizacion.installationName}</p>
                )}
                {cotizacion.quoteName && (
                  <p className="text-xs text-zinc-400 truncate">{cotizacion.quoteName}</p>
                )}
              </div>
            )}
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
              {cotizacion.clientName ?? cotizacion.name ?? cotizacion.code}
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
          {(cotizacion.installationName || cotizacion.quoteName) && (
            <div className="mt-0.5 space-y-0.5">
              {cotizacion.installationName && (
                <p className="text-xs text-zinc-500 truncate">{cotizacion.installationName}</p>
              )}
              {cotizacion.quoteName && (
                <p className="text-xs text-zinc-400 truncate">{cotizacion.quoteName}</p>
              )}
            </div>
          )}
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
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-8">
          {detailLoading && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando detalle...
            </div>
          )}

          {detail && (() => {
            const currencyKey = detail.currency === "UF" ? "UF" : "CLP";
            let sn = 0; // section number counter

            return (
              <>
                {/* Section 0: Header */}
                <ProposalHeader detail={detail} />

                {/* Section 1: Puestos de Trabajo */}
                {detail.positions.length > 0 && (
                  <ProposalPuestos
                    positions={detail.positions}
                    totalGuards={detail.totalGuards}
                    monthlyCost={detail.monthlyCost}
                    currency={detail.currency}
                    sectionNumber={++sn}
                  />
                )}

                {/* Section 2: Detalle de Mano de Obra */}
                {detail.laborBreakdown && detail.laborBreakdown.positionDetails.length > 0 && (
                  <ProposalManoDeObra
                    laborBreakdown={detail.laborBreakdown}
                    sectionNumber={++sn}
                  />
                )}

                {/* Section 3: Cumplimiento Normativo */}
                <CompliancePortal
                  numbered={true}
                  sectionNumber={++sn}
                  items={detail.complianceItems}
                />

                {/* Section 4: Condiciones Comerciales */}
                {(detail.paymentTerms || detail.contractDuration || detail.serviceStartDays != null || detail.validUntil) && (
                  <ProposalCondiciones
                    validUntil={detail.validUntil}
                    paymentTerms={detail.paymentTerms}
                    serviceStartDays={detail.serviceStartDays}
                    contractDuration={detail.contractDuration}
                    sectionNumber={++sn}
                  />
                )}

                {/* Section 5: El Servicio Incluye */}
                <ProposalServicioIncluye
                  items={detail.includedItems}
                  sectionNumber={++sn}
                />

                {/* Section 6: Detalle del Servicio */}
                {(detail.serviceDetail || detail.aiDescription) && (
                  <ProposalDetalleServicio
                    serviceDetail={detail.serviceDetail}
                    aiDescription={detail.aiDescription}
                    sectionNumber={++sn}
                  />
                )}

                {/* Section 7: Tecnología OPAI */}
                <ProposalTecnologia sectionNumber={++sn} />

                {/* Section 8: Estructura de Costos */}
                {detail.costBreakdown && (
                  <ProposalEstructuraCostos
                    breakdown={detail.costBreakdown}
                    sectionNumber={++sn}
                    defaultOpen={detail.templateSections?.showCostBreakdown === true}
                  />
                )}

                {/* Section 9: Desglose de Equipamiento y Recursos */}
                {detail.resourceBreakdown && detail.resourceBreakdown.length > 0 && (
                  <ProposalDesgloseRecursos
                    resourceBreakdown={detail.resourceBreakdown}
                    currency={detail.currency}
                    sectionNumber={++sn}
                    defaultOpen={false}
                  />
                )}

                {/* Documentos adjuntos */}
                {detail.attachments && detail.attachments.length > 0 && (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                    <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-3">
                      <Paperclip className="h-4 w-4 text-slate-400" />
                      Documentos adjuntos
                    </h4>
                    <ul className="space-y-1.5">
                      {detail.attachments.map((att) => (
                        <li
                          key={att.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-white/[0.04] px-2.5 py-2 text-xs"
                        >
                          <span className="truncate text-slate-300 font-medium">{att.fileName}</span>
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

                {/* Notes */}
                {detail.notes && (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                    <h4 className="text-sm font-semibold text-slate-200 mb-2">Notas</h4>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{detail.notes}</p>
                  </div>
                )}

                {/* Section 9: Total + Actions */}
                <ProposalTotalAcciones
                  quoteId={detail.id}
                  monthlyCost={detail.monthlyCost}
                  currency={detail.currency}
                  canAct={canAct}
                  context={context}
                  cotizacionCode={detail.code}
                  onApprove={onApprove}
                  onReject={onReject}
                  onConsult={onConsult}
                  onViewProposal={onViewProposal}
                  onViewContractDraft={onViewContractDraft}
                />
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
