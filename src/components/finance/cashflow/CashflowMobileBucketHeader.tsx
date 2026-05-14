"use client";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";
import type {
  ProjectionBucket,
  CumulativeBalancePoint,
} from "@/modules/finance/cashflow/types";
import { fmt } from "./MatrixHelpers";
import { getBucketDisplayLabel } from "./cashflow-mobile-helpers";

interface Props {
  bucket: ProjectionBucket;
  granularity: "weekly" | "monthly";
  hasPrev: boolean;
  hasNext: boolean;
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function CashflowMobileBucketHeader({
  bucket,
  granularity,
  hasPrev,
  hasNext,
  isCurrent,
  onPrev,
  onNext,
  onTouchStart,
  onTouchEnd,
}: Props) {
  return (
    <div
      className="flex items-center justify-between gap-2"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        className="p-2 -ml-2 rounded-ds-sm hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Período anterior"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0 flex flex-col items-center">
        <h2 className="text-[14px] font-semibold text-ds-text-1 text-center truncate w-full">
          {getBucketDisplayLabel(bucket, granularity)}
        </h2>
        {isCurrent && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-status-info-fg">
            {granularity === "weekly" ? "Esta semana" : "Este mes"}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        className="p-2 -mr-2 rounded-ds-sm hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Período siguiente"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

interface SummaryProps {
  bucket: ProjectionBucket;
  cumulativePoint: CumulativeBalancePoint | undefined;
  /** Si está presente, la fila "Saldo banco real" se vuelve tappable.
   *  Sólo se pasa cuando el bucket activo es el actual y el usuario tiene
   *  permisos para ajustar el saldo. */
  onAdjustBalance?: () => void;
}

/** Card de resumen colapsable al final del bucket activo. */
export function CashflowMobileBucketSummary({
  bucket,
  cumulativePoint,
  onAdjustBalance,
}: SummaryProps) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("cashflow.mobile.summaryExpanded");
    if (v !== null) setExpanded(v === "1");
  }, []);
  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "cashflow.mobile.summaryExpanded",
          next ? "1" : "0",
        );
      } catch {
        // ignore
      }
      return next;
    });
  }

  const netToneCls =
    bucket.net >= 0 ? "text-status-ok-fg" : "text-status-warn-fg";

  return (
    <div className="rounded-ds-md border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              expanded ? "" : "-rotate-90"
            }`}
          />
          <span className="text-[12px] font-mono uppercase tracking-wider text-ds-text-3">
            Resumen del período
          </span>
        </span>
        {!expanded && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
              Neto
            </span>
            <span
              className={`text-[13px] font-mono font-semibold tabular-nums ${netToneCls}`}
            >
              {fmt.format(bucket.net)}
            </span>
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/60">
          <SummaryRow
            label="Neto del período"
            value={fmt.format(bucket.net)}
            tone={bucket.net >= 0 ? "ok" : "warn"}
          />
          <SummaryRow
            label="Saldo proyectado"
            value={
              cumulativePoint ? fmt.format(cumulativePoint.projectedClp) : "—"
            }
            tone={
              cumulativePoint && cumulativePoint.projectedClp < 0
                ? "warn"
                : "ok"
            }
          />
          <SummaryRow
            label="Saldo banco real"
            value={
              cumulativePoint?.realBankClp == null
                ? "—"
                : fmt.format(cumulativePoint.realBankClp)
            }
            tone={
              cumulativePoint?.realBankClp != null &&
              cumulativePoint.realBankClp < 0
                ? "warn"
                : "muted"
            }
            onClick={onAdjustBalance}
            clickTitle="Ajustar saldo del banco"
          />
          <SummaryRow
            label="Δ vs proyectado"
            value={
              cumulativePoint?.cumulativeBankVarianceClp == null
                ? "—"
                : `${
                    cumulativePoint.cumulativeBankVarianceClp > 0 ? "+" : ""
                  }${fmt.format(cumulativePoint.cumulativeBankVarianceClp)}`
            }
            tone="muted"
          />
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  onClick,
  clickTitle,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
  onClick?: () => void;
  clickTitle?: string;
}) {
  const toneCls =
    tone === "ok"
      ? "text-status-ok-fg"
      : tone === "warn"
        ? "text-status-warn-fg"
        : "text-ds-text-2";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-ds-text-3">{label}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={clickTitle}
          aria-label={clickTitle ?? label}
          className={`inline-flex items-center gap-1.5 text-[13px] font-mono font-semibold tabular-nums underline underline-offset-2 decoration-dotted decoration-primary/60 active:opacity-70 cursor-pointer ${toneCls}`}
        >
          <Pencil className="h-3 w-3 opacity-70" aria-hidden="true" />
          {value}
        </button>
      ) : (
        <span
          className={`text-[13px] font-mono font-semibold tabular-nums ${toneCls}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
