"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  onPrev,
  onNext,
  onTouchStart,
  onTouchEnd,
}: Props) {
  return (
    <div
      className="rounded-ds-md border border-border bg-card p-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-2 -ml-2 rounded-ds-sm hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Bucket anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-[14px] font-semibold text-ds-text-1 text-center flex-1 truncate">
          {getBucketDisplayLabel(bucket, granularity)}
        </h2>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="p-2 -mr-2 rounded-ds-sm hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Bucket siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <BucketStat
          label="Ingresos"
          projected={bucket.income}
          actual={bucket.actualIncome}
          tone="ok"
        />
        <BucketStat
          label="Egresos"
          projected={bucket.expense}
          actual={bucket.actualExpense}
          tone="warn"
        />
        <BucketStat
          label="Neto"
          projected={bucket.net}
          actual={null}
          tone={bucket.net >= 0 ? "ok" : "warn"}
        />
      </div>
    </div>
  );
}

function BucketStat({
  label,
  projected,
  actual,
  tone,
}: {
  label: string;
  projected: number;
  actual: number | null;
  tone: "ok" | "warn";
}) {
  const variance = actual !== null && actual > 0 ? actual - projected : null;
  const toneCls =
    tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
        {label}
      </span>
      <span
        className={`text-[15px] font-semibold tabular-nums truncate ${toneCls}`}
      >
        {fmt.format(projected)}
      </span>
      {variance !== null && (
        <span
          className={`text-[10px] tabular-nums ${
            Math.abs(variance) < 50_000
              ? "text-ds-text-3"
              : variance > 0
                ? "text-status-ok-fg"
                : "text-status-warn-fg"
          }`}
          title="Real ejecutado vs proyectado"
        >
          {variance > 0 ? "+" : ""}
          {fmt.format(variance)}
        </span>
      )}
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

/** Card de resumen fijo al final del bucket activo. */
export function CashflowMobileBucketSummary({
  bucket,
  cumulativePoint,
  onAdjustBalance,
}: SummaryProps) {
  return (
    <div className="rounded-ds-md border border-border bg-muted/20 p-3 space-y-2">
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
          cumulativePoint && cumulativePoint.projectedClp < 0 ? "warn" : "ok"
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
          className={`text-[13px] font-mono font-semibold tabular-nums hover:underline underline-offset-2 decoration-dotted cursor-pointer ${toneCls}`}
        >
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
