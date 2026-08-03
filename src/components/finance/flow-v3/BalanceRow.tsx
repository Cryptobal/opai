"use client";

import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, NUM_CLASS, numSizeClass, type NumberFormatMode } from "./format";
import { COL_W, GUTTER_CELL, GUTTER_W, NAME_LEFT, NAME_W, TODAY_COL } from "./grid-classes";

interface Props {
  columns: MatrixColumn[];
  flows: number[];
  balances: number[];
  warnThreshold: number;
  /** Número de gutter de la primera fila del resumen (correlativo de la hoja). */
  startNumber: number;
  numberFormat?: NumberFormatMode;
  selectedColIdx?: number | null;
}

const EYEBROW = "font-sans font-normal tabular-nums leading-none";

/** Heat del saldo: ok / warn (< umbral) / danger (< 0). */
function heatClass(balance: number, warnThreshold: number): string {
  if (balance < 0) return "bg-status-danger-soft text-status-danger-fg";
  if (balance < warnThreshold) return "bg-status-warn-soft text-status-warn-fg";
  return "bg-status-ok-soft/50 text-status-ok-fg";
}

export function BalanceRow({
  columns, flows, balances, warnThreshold, startNumber, numberFormat = "clp", selectedColIdx,
}: Props) {
  const nameTh = `planilla-name-col ${NAME_W} sticky ${NAME_LEFT} z-10 border-r border-t border-ds-border-default bg-ds-surface-2 px-1.5 max-md:px-1 text-left overflow-hidden whitespace-nowrap ${EYEBROW} text-ds-text-3`;
  const gutterTh = `${GUTTER_W} ${GUTTER_CELL} z-10 border-t border-ds-border-default`;
  const cellBase = `${COL_W} border-r border-t border-ds-border-subtle/60 px-1.5 max-md:px-[3px] text-right overflow-hidden whitespace-nowrap ${NUM_CLASS}`;
  const sel = (i: number) => (selectedColIdx === i ? "bg-[hsl(var(--plnx-sel-hdr))]" : "");

  return (
    <tfoot className="sticky bottom-0 z-20">
      <tr className="h-[var(--plnx-row-h)] bg-ds-surface-2">
        <td aria-hidden className={gutterTh}>
          {startNumber}
        </td>
        <th scope="row" className={nameTh}>
          <span className="md:hidden">Flujo</span>
          <span className="max-md:hidden">Flujo semana</span>
        </th>
        {columns.map((c, i) => {
          const text = fmtCell(flows[i], numberFormat);
          return (
            <td
              key={c.key}
              title={numberFormat !== "clp" && flows[i] !== 0 ? fmtCell(flows[i], "clp") : undefined}
              className={`${cellBase} ${numSizeClass(text)} ${c.isCurrent ? TODAY_COL : ""} ${sel(i)} ${
                flows[i] < 0 ? "text-status-danger-fg" : flows[i] > 0 ? "text-status-ok-fg" : "text-ds-text-4"
              }`}
            >
              {text}
            </td>
          );
        })}
      </tr>
      {/* bg opaco en el tr: las celdas heat usan tokens soft translúcidos y el
          footer sticky flota sobre filas que scrollean por debajo. */}
      <tr className="h-[var(--plnx-row-h)] bg-ds-surface-1">
        <td aria-hidden className={`${gutterTh} border-t-0`}>
          {startNumber + 1}
        </td>
        <th scope="row" className={`${nameTh} border-t-0`}>
          <span className="md:hidden">Saldo</span>
          <span className="max-md:hidden">Saldo acumulado</span>
        </th>
        {columns.map((c, i) => {
          const text = fmtCell(balances[i], numberFormat);
          return (
            <td
              key={c.key}
              title={numberFormat !== "clp" && balances[i] !== 0 ? fmtCell(balances[i], "clp") : undefined}
              className={`${cellBase} border-t-0 font-semibold ${numSizeClass(text)} ${heatClass(balances[i], warnThreshold)} ${c.isCurrent ? TODAY_COL : ""} ${sel(i)}`}
            >
              {text}
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
}
