"use client";

import { Anchor } from "lucide-react";
import type { ProjectionAnchorInfo } from "@/modules/finance/cashflow/types";
import { fmtCLP, toDate } from "./format";

/** Banner del ancla activo: la proyección parte del saldo real sellado en el
 *  cierre semanal. No renderiza nada si no hay anchor. */
export function AnchorBanner({ anchor }: { anchor: ProjectionAnchorInfo | null }) {
  if (!anchor) return null;
  const fecha = toDate(anchor.weekEndDate).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
  return (
    <div className="flex items-center gap-2 rounded-ds-lg border border-status-info-border bg-status-info-soft/40 px-3 py-2 text-[13px] text-status-info-fg">
      <Anchor className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Proyección anclada al saldo real de {fecha} ·{" "}
        <span className="font-mono">{fmtCLP.format(anchor.bankBalanceClp)}</span>
      </span>
    </div>
  );
}
