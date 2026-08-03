"use client";

import { fmtClp, fmtCell, fmtShortDate, type NumberFormatMode } from "./format";

interface Props {
  saldoHoy: number | null;
  minBalance: number | null;
  minWeek: string | null;
  bankStale: boolean;
  minTone: string;
  onOpenBank: () => void;
  /** Stats del rango (o fila si 1×N). Vacías cuentan 0 en suma, no en avg/N. */
  rangeSum: number | null;
  rangeAvg: number | null;
  rangeCount: number;
  numberFormat?: NumberFormatMode;
  /** Title con suma exacta CLP. */
  rangeTitle?: string;
}

/**
 * Statusbar (26px): KPIs Banco/Mín + suma/promedio/N del rango.
 * Solo desktop (≥lg); móvil los omite.
 */
export function PlanillaStatusbar({
  saldoHoy, minBalance, minWeek, bankStale, minTone, onOpenBank,
  rangeSum, rangeAvg, rangeCount, numberFormat = "clp", rangeTitle,
}: Props) {
  const fmt = (n: number) => fmtCell(n, numberFormat);
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
      <div className="ml-auto tabular-nums" title={rangeTitle}>
        {rangeSum != null && rangeCount > 0 ? (
          <span>
            Suma <span className="text-ds-text-1">{fmt(rangeSum)}</span>
            {rangeAvg != null && (
              <>
                {" · "}Promedio <span className="text-ds-text-1">{fmt(rangeAvg)}</span>
              </>
            )}
            <span className="text-ds-text-4"> · {rangeCount} celdas</span>
          </span>
        ) : (
          <span className="text-ds-text-4">Sin selección</span>
        )}
      </div>
    </div>
  );
}
