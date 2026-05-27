"use client";
import { ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface Props {
  bucket: ProjectionBucket;
  direction: "prev" | "next";
  overdueCount: number;
  movementCount: number;
  onTap: () => void;
}

export function CashflowMobileBucketMini({
  bucket,
  direction,
  overdueCount,
  movementCount,
  onTap,
}: Props) {
  const net = bucket.income - bucket.expense;
  const netPositive = net >= 0;
  const dateLabel = `${format(bucket.start, "d MMM", { locale: es })}–${format(bucket.end, "d MMM", { locale: es })}`;
  const Chevron = direction === "prev" ? ChevronUp : ChevronDown;
  const directionLabel = direction === "prev" ? "Semana anterior" : "Siguiente semana";

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-left rounded-ds-lg border border-border bg-card/60 hover:bg-card hover:border-border-strong transition-colors px-3 py-2.5 flex items-center gap-3"
      aria-label={`Cambiar a ${directionLabel}: ${bucket.label}`}
    >
      <Chevron className="h-4 w-4 text-ds-text-3 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.06em] text-ds-text-3">
            {directionLabel}
          </p>
          <p className="text-[11px] text-ds-text-3 truncate">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p
            className={`text-[14px] font-semibold tabular-nums ${
              netPositive ? "text-status-ok-fg" : "text-status-warn-fg"
            }`}
          >
            {netPositive ? "+" : ""}{fmtCLP.format(net)}
          </p>
          <p className="text-[11px] text-ds-text-3">
            · {movementCount} mov
          </p>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-ds-sm bg-red-500/15 text-red-300 text-[10px] font-medium">
              <AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />
              {overdueCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
