"use client";
import { AlertCircle } from "lucide-react";
import type { CashflowCellStatus } from "@/modules/finance/cashflow/types";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const DOT_TONE: Record<Exclude<CashflowCellStatus, "PROJECTED">, string> = {
  DRAFT: "bg-status-warn-fg",
  INVOICED: "bg-status-info-fg",
  CEDED: "bg-purple-500 dark:bg-purple-400",
  PAID: "bg-status-ok-fg",
};

const STATUS_TITLE: Record<Exclude<CashflowCellStatus, "PROJECTED">, string> = {
  DRAFT: "Borrador",
  INVOICED: "Facturada",
  CEDED: "Cedida",
  PAID: "Pagada",
};

/**
 * Renderiza el valor de una celda en la matriz de proyección. Tres modos:
 *  - Sin actual: solo el proyectado.
 *  - Con actual y varianza ≠ 0: proyectado tachado + actual bold + Δ coloreado.
 *  - Con actual y varianza = 0: proyectado normal (no agrega visual ruido).
 *
 * Si la celda tiene un DTE vinculado (cellStatus ≠ PROJECTED) se muestra un
 * dot de 6px en la esquina superior derecha con el tono del estado. En
 * INVOICED + daysOverdue > 0 además aparece un ícono AlertCircle pequeño.
 *
 * Color de la varianza:
 *  - EXPENSE: positiva (sobregasto) = warn (amber); negativa (ahorro) = ok (verde).
 *  - INCOME: positiva (extra) = ok; negativa (faltante) = warn.
 */
export function CellAmount({
  projected,
  actual,
  variance,
  kind,
  cellStatus,
  daysOverdue,
}: {
  projected: number;
  actual: number | null;
  variance: number | null;
  kind: "INCOME" | "EXPENSE";
  cellStatus?: CashflowCellStatus;
  daysOverdue?: number;
}) {
  const hasBadge = cellStatus && cellStatus !== "PROJECTED";
  const overdueWarn =
    cellStatus === "INVOICED" && (daysOverdue ?? 0) > 0;

  const dot = hasBadge ? (
    <span
      className="absolute -top-1 -right-1 inline-flex items-center gap-0.5"
      title={
        cellStatus === "INVOICED" && overdueWarn
          ? `${STATUS_TITLE.INVOICED} · ${daysOverdue}d de mora`
          : STATUS_TITLE[cellStatus as Exclude<CashflowCellStatus, "PROJECTED">]
      }
    >
      {overdueWarn && (
        <AlertCircle
          className="h-3 w-3 text-status-warn-fg"
          aria-label={`${daysOverdue} días de mora`}
        />
      )}
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          DOT_TONE[cellStatus as Exclude<CashflowCellStatus, "PROJECTED">]
        }`}
        aria-label={STATUS_TITLE[cellStatus as Exclude<CashflowCellStatus, "PROJECTED">]}
      />
    </span>
  ) : null;

  if (actual === null || variance === null) {
    return (
      <span className="relative inline-block">
        <span className="font-mono text-[12px]">
          {projected > 0 ? fmt.format(projected) : "—"}
        </span>
        {dot}
      </span>
    );
  }
  if (variance === 0) {
    return (
      <span className="relative inline-block">
        <span className="font-mono text-[12px]">{fmt.format(actual)}</span>
        {dot}
      </span>
    );
  }
  const isAdverse = kind === "EXPENSE" ? variance > 0 : variance < 0;
  const tone = isAdverse ? "text-status-warn-fg" : "text-status-ok-fg";
  return (
    <span className="relative inline-block">
      <div className="leading-tight">
        <div className="font-mono text-[12px] line-through opacity-50">
          {fmt.format(projected)}
        </div>
        <div className="font-mono text-[12px] font-semibold">
          {fmt.format(actual)}
        </div>
        <div className={`font-mono text-[12px] ${tone}`}>
          {variance > 0 ? "+" : ""}
          {fmt.format(variance)}
        </div>
      </div>
      {dot}
    </span>
  );
}
