"use client";

import { Lock } from "lucide-react";
import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { ymdToDate } from "@/modules/finance/flow-v3/weeks";
import { fmtDayMonth } from "./format";
import { COL_W, GUTTER_W, NAME_LEFT, NAME_W, TODAY_COL } from "./grid-classes";
import { columnLetter } from "./column-letter";

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
const EYEBROW = "font-sans font-normal tabular-nums leading-none text-[length:inherit]";

interface Props {
  columns: MatrixColumn[];
  granularity: "week" | "month";
  /** Lunes ISO de semanas selladas por cierre (candado + celdas de solo lectura). */
  closedWeeks?: string[];
  /** Índice de columna de datos seleccionada (0-based) para tintar el header. */
  selectedColIdx?: number | null;
}

/**
 * Encabezado de la hoja (3 filas sticky):
 *  1. letras de columna (A = Concepto, B… = semanas, AA tras Z) + esquina;
 *  2. mes/año agrupando columnas consecutivas;
 *  3. semana ISO + fecha de inicio (fusionadas).
 * El gutter y Concepto son sticky-left; la esquina resuelve ambos ejes (z-40).
 */
export function PlanillaHeader({ columns, granularity, closedWeeks, selectedColIdx }: Props) {
  const closedSet = new Set(closedWeeks ?? []);
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

  const thBase = `border-b border-r border-ds-border-subtle/60 bg-ds-surface-2 px-1 max-md:px-[3px] ${EYEBROW}`;
  const cornerBase = `sticky z-40 border-b border-r bg-ds-surface-2 ${EYEBROW}`;
  const selHdr = "bg-[var(--plnx-sel-hdr,#d3e3fd)]";

  return (
    <thead>
      {/* ── Fila 1: letras de columna ── */}
      <tr className="h-[var(--plnx-hdr-1)]">
        <th
          aria-label="Esquina"
          data-plnx-corner=""
          className={`${GUTTER_W} ${cornerBase} left-0 top-0 border-ds-border-default`}
        />
        <th
          data-plnx-cola=""
          className={`${NAME_W} ${cornerBase} ${NAME_LEFT} top-0 border-ds-border-default text-center text-ds-text-4`}
        >
          A
        </th>
        {columns.map((c, i) => (
          <th
            key={c.key}
            className={`sticky top-0 z-30 ${COL_W} ${thBase} text-center text-ds-text-4 ${c.isCurrent ? TODAY_COL : ""} ${selectedColIdx === i ? selHdr : ""}`}
          >
            {columnLetter(i + 1)}
          </th>
        ))}
      </tr>
      {/* ── Fila 2: mes/año (Concepto ocupa filas 2-3 en la columna A) ── */}
      <tr className="h-[var(--plnx-hdr-2)]">
        <th
          rowSpan={2}
          aria-label="Números de fila"
          className={`${GUTTER_W} ${cornerBase} left-0 top-[var(--plnx-hdr-1)] border-ds-border-default`}
        />
        <th
          rowSpan={2}
          className={`${NAME_W} ${cornerBase} ${NAME_LEFT} top-[var(--plnx-hdr-1)] border-ds-border-default px-1.5 max-md:px-1 text-left align-bottom pb-0.5 text-ds-text-3`}
        >
          Concepto
        </th>
        {groups.map((g, i) => (
          <th key={i} colSpan={g.span} className={`sticky top-[var(--plnx-hdr-1)] z-30 ${thBase} overflow-hidden whitespace-nowrap text-center text-ds-text-2`}>
            {g.label}
          </th>
        ))}
      </tr>
      {/* ── Fila 3: semana ISO + fecha de inicio ── */}
      <tr className="h-[var(--plnx-hdr-3)]">
        {columns.map((c) => (
          <th
            key={c.key}
            data-week={c.weekStart}
            data-current={c.isCurrent ? "true" : undefined}
            className={`sticky top-[calc(var(--plnx-hdr-1)+var(--plnx-hdr-2))] z-30 ${COL_W} ${thBase} overflow-hidden whitespace-nowrap text-right ${
              c.isCurrent ? `${TODAY_COL} text-primary` : "text-ds-text-3"
            }`}
          >
            {granularity === "week" ? (
              <>
                {closedSet.has(c.weekStart) && (
                  <Lock className="mr-0.5 inline-block h-2.5 w-2.5 align-[-1px] text-ds-text-4" aria-label="Semana cerrada" />
                )}
                <span className={c.isCurrent ? "text-primary" : "text-ds-text-2"}>{c.label}</span>
                {isQuincenaWeek(c.weekStart) && (
                  <sup className="text-[9px] text-status-warn-fg">Q</sup>
                )}{" "}
                {fmtDayMonth(c.weekStart)}
              </>
            ) : (
              // Mensual: el año vive en la fila 2; aquí mes + semanas agrupadas.
              <>{MONTHS[Number(c.monthKey.slice(5, 7)) - 1]} · {c.weekCount}s</>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
