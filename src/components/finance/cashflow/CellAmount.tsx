"use client";
import { AlertCircle } from "lucide-react";
import type {
  CashflowCellStatus,
  CellDteSummary,
} from "@/modules/finance/cashflow/types";
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
  dtes,
  modoCobro,
}: {
  projected: number;
  actual: number | null;
  variance: number | null;
  kind: "INCOME" | "EXPENSE";
  cellStatus?: CashflowCellStatus;
  daysOverdue?: number;
  dteFolio?: number | null;
  /** Lista completa de DTEs conciliados con la celda. Si tiene >1, el
   *  tooltip muestra TODOS los folios para que el hover sea informativo
   *  sin tener que abrir el popover (caso típico: pago extra + factura
   *  regular del mismo cliente en la misma semana). */
  dtes?: CellDteSummary[];
  /** Patrón de cobro del contrato (BLOQUE 5 / Fase 6). Cuando es FACTORING
   *  pintamos un mini-badge "F" en la esquina y agregamos una línea al
   *  tooltip ("Factoring · cobro acelerado"). El monto en la celda es el
   *  bruto; el descuento real del factoring se aplica al emitir cada
   *  factura puntual (modal aparte), no en la proyección. */
  modoCobro?: "DIRECTO" | "FACTORING";
}) {
  const hasBadge = cellStatus && cellStatus !== "PROJECTED";
  const overdueWarn =
    cellStatus === "INVOICED" && (daysOverdue ?? 0) > 0;

  const statusLabel = hasBadge
    ? STATUS_TITLE[cellStatus as Exclude<CashflowCellStatus, "PROJECTED">]
    : null;

  const tooltipLines: string[] = [];
  const visibleDtes = (dtes ?? []).filter((d) => d.folio != null);
  if (visibleDtes.length > 1) {
    tooltipLines.push(
      `Facturas N° ${visibleDtes.map((d) => d.folio).join(", ")}`,
    );
  } else if (visibleDtes.length === 1 && visibleDtes[0].folio) {
    tooltipLines.push(`Factura N° ${visibleDtes[0].folio}`);
  } else if (dteFolio) {
    tooltipLines.push(`Factura N° ${dteFolio}`);
  }
  if (statusLabel) {
    const suffix =
      visibleDtes.length > 1 ? ` · ${visibleDtes.length} facturas` : "";
    tooltipLines.push(
      overdueWarn
        ? `${statusLabel} · ${daysOverdue}d de mora${suffix}`
        : `${statusLabel}${suffix}`,
    );
  }
  // BLOQUE 5 / Fase 6: marcar el patrón factoring del contrato en el
  // tooltip cuando la celda tiene proyección. Aclaramos que el monto
  // mostrado es bruto — el descuento real ocurre al emitir cada factura.
  if (modoCobro === "FACTORING" && projected > 0) {
    tooltipLines.push("Factoring · cobro acelerado");
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

  // BLOQUE 5 / Fase 6: badge "F" en la esquina superior izquierda cuando
  // el contrato cobra vía factoring. Solo lo pintamos si la celda tiene
  // monto proyectado (sin proyección la esquina queda vacía y el badge
  // colgaría sobre un guión "—" sin sentido). No interfiere con el dot
  // de cellStatus (esquina opuesta).
  const factoringBadge =
    modoCobro === "FACTORING" && projected > 0 ? (
      <span
        className="absolute -top-1 -left-1 text-[8px] font-bold leading-none text-purple-400 dark:text-purple-300"
        title="Factoring"
        aria-label="Factoring"
      >
        F
      </span>
    ) : null;

  // Cuando la celda no tiene proyección propia (amountClp=0) ni monto
  // real bancario (actualAmount=null) pero sí tiene DTE(s) enganchado(s),
  // mostramos el monto bruto del/los DTE(s) en lugar de "—".
  //
  // Caso típico: factura emitida en una semana distinta a la cuota
  // proyectada del contrato. El matcher de orphans crea una occurrence
  // sintética con amountClp=0 para no inflar la proyección, pero la
  // factura es real y el usuario necesita verla.
  //
  // Si hay múltiples DTEs en la misma celda (varias facturas del mismo
  // cliente en la misma semana), sumamos los totalAmount.
  const hasDtesWithAmount =
    (dtes?.length ?? 0) > 0 && dtes!.some((d) => d.totalAmount > 0);
  const dteFallbackAmount = hasDtesWithAmount
    ? dtes!.reduce((sum, d) => sum + (d.totalAmount ?? 0), 0)
    : 0;
  const useDteFallback =
    actual === null && projected === 0 && hasDtesWithAmount;

  const body =
    actual === null || variance === null ? (
      <span className="relative inline-block">
        {useDteFallback ? (
          <span
            className="font-mono text-[12px] italic text-ds-text-2"
            title="Monto de factura emitida (sin proyección en esta celda)"
          >
            {fmt.format(dteFallbackAmount)}
          </span>
        ) : (
          <span className="font-mono text-[12px]">
            {projected > 0 ? fmt.format(projected) : "—"}
          </span>
        )}
        {factoringBadge}
        {dot}
      </span>
    ) : variance === 0 ? (
      <span className="relative inline-block">
        <span className="font-mono text-[12px]">{fmt.format(actual)}</span>
        {factoringBadge}
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
        {factoringBadge}
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
