"use client";

import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { ymdToDate } from "@/modules/finance/flow-v3/weeks";
import { fmtDayMonth } from "./format";
import { COL_W, NAME_W, TODAY_COL } from "./grid-classes";

/** ¿La semana (lunes YMD) contiene el día 15 de su mes? → marca Q (quincena). */
function isQuincenaWeek(weekStart: string): boolean {
  const d = ymdToDate(weekStart);
  if (!d) return false;
  for (let i = 0; i < 7; i++) {
    const day = new Date(d.getTime() + i * 86_400_000);
    if (day.getUTCDate() === 15) return true;
  }
  return false;
}

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const EYEBROW = "font-mono uppercase tracking-wide text-[11px]";

interface Props {
  columns: MatrixColumn[];
  granularity: "week" | "month";
}

export function PlanillaHeader({ columns, granularity }: Props) {
  // Fila MES: agrupa columnas consecutivas por monthKey (o año en mensual).
  const groups: Array<{ label: string; span: number }> = [];
  for (const c of columns) {
    const key =
      granularity === "week"
        ? `${MONTHS[Number(c.monthKey.slice(5, 7)) - 1]} ${c.monthKey.slice(2, 4)}`
        : c.monthKey.slice(0, 4);
    const g = groups[groups.length - 1];
    if (g && g.label === key) g.span += 1;
    else groups.push({ label: key, span: 1 });
  }

  const thBase = `border-b border-r border-ds-border-subtle/60 bg-ds-surface-2 px-1.5 ${EYEBROW}`;

  return (
    <thead>
      <tr className="h-[18px]">
        <th rowSpan={3} className={`${NAME_W} sticky left-0 top-0 z-30 border-b border-r border-ds-border-default bg-ds-surface-2 px-1.5 text-left align-bottom ${EYEBROW} text-ds-text-3`}>
          Concepto
        </th>
        {groups.map((g, i) => (
          <th key={i} colSpan={g.span} className={`sticky top-0 z-20 ${thBase} text-center text-ds-text-2`}>
            {g.label}
          </th>
        ))}
      </tr>
      <tr className="h-[18px]">
        {columns.map((c) => (
          <th
            key={c.key}
            className={`sticky top-[18px] z-20 ${COL_W} ${thBase} text-right ${c.isCurrent ? `${TODAY_COL} text-primary` : "text-ds-text-2"}`}
          >
            {granularity === "week" ? (
              <>
                {c.label}
                {isQuincenaWeek(c.weekStart) && (
                  <sup className="ml-px font-mono text-[8px] text-status-warn-fg">Q</sup>
                )}
              </>
            ) : (
              c.label
            )}
          </th>
        ))}
      </tr>
      <tr className="h-[16px]">
        {columns.map((c) => (
          <th
            key={c.key}
            className={`sticky top-[36px] z-20 ${COL_W} ${thBase} text-right text-ds-text-4 ${c.isCurrent ? TODAY_COL : ""}`}
          >
            {granularity === "week" ? fmtDayMonth(c.weekStart) : `${c.weekCount} sem`}
          </th>
        ))}
      </tr>
    </thead>
  );
}
