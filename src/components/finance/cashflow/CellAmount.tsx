"use client";
import { AlertCircle } from "lucide-react";
import type { CashflowCellStatus } from "@/modules/finance/cashflow/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
 * Al hover, un tooltip muestra el folio de la factura (si existe) junto al
 * estado humano y días de mora cuando aplica.
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
  dteFolio,
}: {
  projected: number;
  actual: number | null;
  variance: number | null;
  kind: "INCOME" | "EXPENSE";
  cellStatus?: CashflowCellStatus;
  daysOverdue?: number;
  dteFolio?: number | null;
}) {
  const hasBadge = cellStatus && cellStatus !== "PROJECTED";
  const overdueWarn =
    cellStatus === "INVOICED" && (daysOverdue ?? 0) > 0;

  const statusLabel = hasBadge
    ? STATUS_TITLE[cellStatus as Exclude<CashflowCellStatus, "PROJECTED">]
    : null;

  const tooltipLines: string[] = [];
  if (dteFolio) tooltipLines.push(`Factura N° ${dteFolio}`);
  if (statusLabel) {
    tooltipLines.push(
      overdueWarn ? `${statusLabel} · ${daysOverdue}d de mora` : statusLabel,
    );
  }

  const dot = hasBadge ? (
    <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5">
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
        aria-label={statusLabel ?? undefined}
      />
    </span>
  ) : null;

  const body =
    actual === null || variance === null ? (
      <span className="relative inline-block">
        <span className="font-mono text-[12px]">
          {projected > 0 ? fmt.format(projected) : "—"}
        </span>
        {dot}
      </span>
    ) : variance === 0 ? (
      <span className="relative inline-block">
        <span className="font-mono text-[12px]">{fmt.format(actual)}</span>
        {dot}
      </span>
    ) : (
      <span className="relative inline-block">
        <div className="leading-tight">
          <div className="font-mono text-[12px] line-through opacity-50">
            {fmt.format(projected)}
          </div>
          <div className="font-mono text-[12px] font-semibold">
            {fmt.format(actual)}
          </div>
          <div
            className={`font-mono text-[12px] ${
              (kind === "EXPENSE" ? variance > 0 : variance < 0)
                ? "text-status-warn-fg"
                : "text-status-ok-fg"
            }`}
          >
            {variance > 0 ? "+" : ""}
            {fmt.format(variance)}
          </div>
        </div>
        {dot}
      </span>
    );

  if (tooltipLines.length === 0) return body;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{body}</span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          {tooltipLines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
