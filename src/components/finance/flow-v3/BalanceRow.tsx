"use client";

import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, NUM_CLASS } from "./format";
import { COL_W, NAME_W, TODAY_COL } from "./grid-classes";

interface Props {
  columns: MatrixColumn[];
  flows: number[];
  balances: number[];
  warnThreshold: number;
}

const EYEBROW = "font-mono uppercase tracking-wide text-[11px]";

/** Heat del saldo: ok / warn (< umbral) / danger (< 0). */
function heatClass(balance: number, warnThreshold: number): string {
  if (balance < 0) return "bg-status-danger-soft text-status-danger-fg";
  if (balance < warnThreshold) return "bg-status-warn-soft text-status-warn-fg";
  return "bg-status-ok-soft/50 text-status-ok-fg";
}

export function BalanceRow({ columns, flows, balances, warnThreshold }: Props) {
  const nameTh = `${NAME_W} sticky left-0 z-10 border-r border-t border-ds-border-default bg-ds-surface-2 px-1.5 text-left ${EYEBROW} text-ds-text-3`;
  const cellBase = `${COL_W} border-r border-t border-ds-border-subtle/60 px-1.5 text-right ${NUM_CLASS}`;

  return (
    <tfoot className="sticky bottom-0 z-10">
      <tr className="h-[22px] bg-ds-surface-2">
        <th scope="row" className={nameTh}>
          Flujo semana
        </th>
        {columns.map((c, i) => (
          <td
            key={c.key}
            className={`${cellBase} ${c.isCurrent ? TODAY_COL : ""} ${
              flows[i] < 0 ? "text-status-danger-fg" : flows[i] > 0 ? "text-status-ok-fg" : "text-ds-text-4"
            }`}
          >
            {fmtCell(flows[i])}
          </td>
        ))}
      </tr>
      <tr className="h-[22px]">
        <th scope="row" className={`${nameTh} border-b-0`}>
          Saldo acumulado
        </th>
        {columns.map((c, i) => (
          <td
            key={c.key}
            className={`${cellBase} font-semibold ${heatClass(balances[i], warnThreshold)} ${c.isCurrent ? TODAY_COL : ""}`}
          >
            {fmtCell(balances[i])}
          </td>
        ))}
      </tr>
    </tfoot>
  );
}
