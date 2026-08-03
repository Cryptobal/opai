"use client";

import { fmtClp, fmtShortDate } from "./format";

interface Props {
  saldoHoy: number | null;
  minBalance: number | null;
  minWeek: string | null;
  bankStale: boolean;
  minTone: string;
  onOpenBank: () => void;
  /** Suma de la fila seleccionada (celdas no vacías) y conteo. */
  rowSum: number | null;
  rowCellCount: number;
}

/**
 * Statusbar (26px): KPIs Banco/Mín a la izquierda + suma de fila a la derecha.
 * Solo desktop (≥lg); móvil los omite.
 */
export function PlanillaStatusbar({
  saldoHoy, minBalance, minWeek, bankStale, minTone, onOpenBank, rowSum, rowCellCount,
}: Props) {
  return (
    <div
      className="planilla-chrome-print-hide mt-0.5 hidden h-[var(--plnx-statusbar-h)] items-center gap-3 border-t border-ds-border-subtle bg-ds-surface-2 px-2 text-[12px] text-ds-text-2 lg:flex"
      role="status"
      aria-label="Barra de estado"
    >
      {saldoHoy != null && (
        <button
          type="button"
          onClick={onOpenBank}
          className="rounded px-1 hover:bg-ds-surface-3"
          title="Ver desglose por cuenta"
        >
          Banco hoy{" "}
          <span className={`tabular-nums ${bankStale ? "text-status-warn-fg" : "text-ds-text-1"}`}>
            {fmtClp(saldoHoy)}
          </span>
        </button>
      )}
      {minBalance != null && minWeek && (
        <>
          <span aria-hidden>·</span>
          <span>
            Mín <span className={`tabular-nums ${minTone}`}>{fmtClp(minBalance)}</span>{" "}
            <span className="text-ds-text-4">({fmtShortDate(minWeek)})</span>
          </span>
        </>
      )}
      <div className="ml-auto tabular-nums">
        {rowSum != null && rowCellCount > 0 ? (
          <span>
            Fila: suma <span className="text-ds-text-1">{fmtClp(rowSum)}</span>
            <span className="text-ds-text-4"> · {rowCellCount} celdas</span>
          </span>
        ) : (
          <span className="text-ds-text-4">Sin fila seleccionada</span>
        )}
      </div>
    </div>
  );
}
