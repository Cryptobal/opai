"use client";

import { Anchor, Pencil } from "lucide-react";
import type { ProjectionAnchorInfo } from "@/modules/finance/cashflow/types";
import { fmtCLP, toDate } from "./format";

interface Props {
  anchor: ProjectionAnchorInfo | null;
  /** Saldo banco consolidado de hoy. Si coincide con el del anchor y el
   *  anchor no es manual, el banner se oculta (info redundante). */
  currentOpening?: number;
}

/** Banner del ancla activo:
 *  - Si el ancla es MANUAL → siempre se muestra (info importante de auditoría).
 *  - Si el ancla coincide con el saldo banco hoy (típico) → se oculta.
 *  - Si hay diferencia significativa (>$1) → se muestra con tono informativo. */
export function AnchorBanner({ anchor, currentOpening }: Props) {
  if (!anchor) return null;

  const sameAsToday =
    currentOpening != null &&
    Math.abs(currentOpening - anchor.bankBalanceClp) < 1;

  // Si coincide y NO es manual → ocultar (no aporta nada que no esté en el KPI)
  if (sameAsToday && !anchor.isManual) return null;

  const fecha = toDate(anchor.weekEndDate).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="flex items-start gap-2 rounded-ds-md border border-status-info-border bg-status-info-soft/30 px-2.5 py-1.5 text-[11px] text-status-info-fg">
      <Anchor className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span>
          Proyección anclada al saldo {anchor.isManual ? "manual" : "real"} de {fecha} ·{" "}
          <span className="font-mono">{fmtCLP.format(anchor.bankBalanceClp)}</span>
        </span>
        {anchor.isManual && (
          <span
            className="ml-1.5 inline-flex items-center gap-1 rounded-ds-sm bg-status-warn-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-status-warn-fg align-middle"
            title={anchor.manualReason ?? undefined}
          >
            <Pencil className="h-2.5 w-2.5" />
            manual
          </span>
        )}
        {anchor.isManual && anchor.manualReason && (
          <div className="mt-0.5 text-[10px] italic opacity-80 truncate">
            "{anchor.manualReason}"
          </div>
        )}
      </div>
    </div>
  );
}
