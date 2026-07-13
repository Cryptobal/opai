"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
  CircleDot,
  Hand,
  Lock,
  LockOpen,
  X,
} from "lucide-react";
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
  onReopenWeek,
  canManage = true,
  currentBankBalanceClp,
}: {
  w: WeekStatusDTO;
  onCloseWeek: (weekEndIso: string) => void;
  onReopenWeek?: (weekEndIso: string) => void;
  /** Solo con permiso de gestión se muestran las acciones (cerrar / candado). */
  canManage?: boolean;
  currentBankBalanceClp?: number;
}) {
  // Confirmación inline del candado: reabrir es destructivo (deshace el cierre),
  // así que el primer clic muestra confirmar/cancelar en la misma fila.
  const [confirmingReopen, setConfirmingReopen] = useState(false);
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
      {w.isAnchor && <Anchor className="h-3 w-3 text-status-info-fg" aria-label="ancla" />}
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
        {/* Semana abierta / en curso → botón amarillo para cerrarla. */}
        {canManage && w.state !== "CLOSED" && w.state !== "FUTURE" && (
          <button
            type="button"
            onClick={() => onCloseWeek(w.weekEndDate)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ds-md border border-status-warn-border bg-status-warn-soft px-3 text-[12px] font-medium text-status-warn-fg transition-colors hover:brightness-95 sm:min-h-[36px]"
          >
            <Lock className="h-3.5 w-3.5" />
            Cerrar semana
          </button>
        )}

        {/* Semana cerrada → candado. Al presionarlo se reabre SOLO esa semana,
            con confirmación inline (deshacer un cierre es destructivo). */}
        {canManage && w.state === "CLOSED" && onReopenWeek && (
          confirmingReopen ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[12px] text-ds-text-2">
                {w.isAnchor ? "¿Reabrir el ancla?" : "¿Reabrir?"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setConfirmingReopen(false);
                  onReopenWeek(w.weekEndDate);
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ds-md border border-status-warn-border bg-status-warn-soft px-2.5 text-[12px] font-medium text-status-warn-fg transition-colors hover:brightness-95 sm:min-h-[36px]"
              >
                <LockOpen className="h-3.5 w-3.5" />
                Reabrir
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReopen(false)}
                aria-label="Cancelar"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors hover:bg-ds-surface-2 sm:min-h-[36px] sm:min-w-[36px]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReopen(true)}
              aria-label="Reabrir semana"
              title="Semana cerrada · presiona para reabrir"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors hover:border-status-warn-border hover:bg-status-warn-soft hover:text-status-warn-fg sm:min-h-[36px] sm:min-w-[36px]"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </span>
    </li>
  );
}
