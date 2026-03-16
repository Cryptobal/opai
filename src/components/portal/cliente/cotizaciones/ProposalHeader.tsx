"use client";

import { AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { QuoteDetail } from "./types";
import { STATUS_BADGE, STATUS_LABEL, getDisplayStatus, isActionable, seemsCurrencyWrong } from "./types";

interface ProposalHeaderProps {
  detail: QuoteDetail;
  className?: string;
}

export function ProposalHeader({ detail, className }: ProposalHeaderProps) {
  const displayStatus = getDisplayStatus(detail);
  const statusBadge = STATUS_BADGE[displayStatus] ?? STATUS_BADGE.draft;
  const statusLabel = STATUS_LABEL[displayStatus] ?? detail.status;
  const canAct = isActionable(detail);
  const currencyKey = detail.currency === "UF" ? "UF" : "CLP";

  return (
    <div className={cn("space-y-3", className)}>
      {/* Code + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-slate-500">{detail.code}</span>
        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusBadge)}>
          {statusLabel}
        </span>
        {canAct && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-900/40 text-teal-300">
            Requiere acción
          </span>
        )}
        {detail.aiDescription && (
          <span className="text-[10px] uppercase tracking-wider bg-teal-500/10 text-teal-400/70 rounded-full px-2 py-0.5 font-medium">
            Análisis OPAI AI
          </span>
        )}
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl font-bold text-emerald-400 font-mono">
          {formatCurrency(detail.monthlyCost, currencyKey)}
        </span>
        <span className="text-sm text-slate-500">/mes</span>
        {seemsCurrencyWrong(detail.monthlyCost, detail.currency) && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Verificar moneda
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-400">
        {detail.totalPositions} puesto{detail.totalPositions !== 1 ? "s" : ""} ·{" "}
        {detail.totalGuards} guardia{detail.totalGuards !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
