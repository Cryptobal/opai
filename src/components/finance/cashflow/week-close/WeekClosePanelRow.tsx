"use client";

import { AlertTriangle, CheckCircle2, CircleDot, Hand, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCLP, VARIANCE_DRIFT_THRESHOLD_CLP } from "./types";

export interface WeekStatusDTO {
  weekStartDate: string;
  weekEndDate: string;
  label: string;
  state: "CLOSED" | "OPEN" | "CURRENT" | "FUTURE";
  isAnchor: boolean;
  isManual: boolean;
  bankBalanceClp: number | null;
  varianceClp: number | null;
  varianceResolution: string | null;
}

const STATE_LABEL: Record<WeekStatusDTO["state"], string> = {
  CLOSED: "cerrada",
  OPEN: "SIN CERRAR",
  CURRENT: "en curso",
  FUTURE: "futura",
};

/** Nota corta de cómo se resolvió la varianza / si fue cierre manual. */
function noteFor(w: WeekStatusDTO): string | null {
  if (w.isManual) return "manual";
  if (w.varianceResolution === "ACCEPTED") return "aceptado";
  if (w.varianceResolution === "ADJUSTED") return "ajustado";
  return null;
}

/** Una fila del panel de semanas por cerrar. En 375px las metas se apilan bajo
 *  el label (flex-wrap) y el botón mantiene ≥44px de alto. */
export function WeekClosePanelRow({
  w,
  onCloseWeek,
  currentBankBalanceClp,
}: {
  w: WeekStatusDTO;
  onCloseWeek: (weekEndIso: string) => void;
  currentBankBalanceClp?: number;
}) {
  const isGap = w.state === "OPEN";
  const note = noteFor(w);
  const balance =
    w.bankBalanceClp ??
    (w.state === "CURRENT" ? currentBankBalanceClp ?? null : null);
  const v = w.varianceClp;
  const vTone =
    v == null
      ? "text-ds-text-3"
      : v === 0
        ? "text-status-ok-fg"
        : Math.abs(v) >= VARIANCE_DRIFT_THRESHOLD_CLP
          ? "text-status-warn-fg"
          : "text-ds-text-2";

  const StateIcon =
    w.state === "CURRENT" ? CircleDot : isGap ? AlertTriangle : CheckCircle2;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-ds-md border px-3 py-2",
        isGap
          ? "border-status-warn-border bg-status-warn-soft"
          : "border-ds-border-default bg-ds-surface-1",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium text-ds-text-1",
          isGap && "text-status-warn-fg",
        )}
      >
        <StateIcon className="h-3.5 w-3.5 shrink-0" />
        {w.label}
      </span>
      <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
        {STATE_LABEL[w.state]}
      </span>
      {w.isAnchor && <Lock className="h-3 w-3 text-status-info-fg" aria-label="ancla" />}
      {w.isManual && <Hand className="h-3 w-3 text-ds-text-3" aria-label="manual" />}

      <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <span className="font-mono text-[12px] tabular-nums text-ds-text-2">
          {balance != null ? `Banco ${fmtCLP.format(balance)}` : "—"}
        </span>
        {v != null && (
          <span className={cn("font-mono text-[12px] tabular-nums", vTone)}>
            Δ {v > 0 ? "+" : ""}
            {fmtCLP.format(v)}
            {note && (
              <span className="ml-1 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
                {note}
              </span>
            )}
          </span>
        )}
        {w.state !== "CLOSED" && w.state !== "FUTURE" && (
          <button
            type="button"
            onClick={() => onCloseWeek(w.weekEndDate)}
            className="inline-flex min-h-[44px] items-center rounded-ds-md border border-ds-border-default px-3 text-[12px] font-medium text-ds-text-1 transition-colors hover:bg-ds-surface-2"
          >
            Cerrar semana
          </button>
        )}
      </span>
    </li>
  );
}
