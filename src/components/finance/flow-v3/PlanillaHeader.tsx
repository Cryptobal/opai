"use client";

import { useCallback, useRef } from "react";
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
const NAME_W_MIN = 140;
const NAME_W_MAX = 320;

interface Props {
  columns: MatrixColumn[];
  granularity: "week" | "month";
  closedWeeks?: string[];
  /** Índices de columna en el rango (tinte de header). */
  selectedColIndices?: Set<number>;
  onSelectCol?: (colIdx: number) => void;
  /** Clic en la esquina: seleccionar toda la hoja. */
  onSelectAll?: () => void;
  /** true cuando el rango cubre toda la hoja (tinte de esquina). */
  allSelected?: boolean;
  /** Orden por monto de sesión (indicador ▼/▲). */
  sortBy?: { weekStart: string; dir: "asc" | "desc" } | null;
  /** Ancho de Concepto (solo desktop; null = no resize). */
  nameW?: number;
  onNameWChange?: (w: number) => void;
  /** Autoajuste al contenido visible (doble clic). */
  onNameWAutoFit?: () => void;
}

/**
 * Encabezado de la hoja (3 filas sticky). Clic en semana = selecciona columna.
 * Divisor de resize en Concepto (desktop).
 */
export function PlanillaHeader({
  columns, granularity, closedWeeks, selectedColIndices,
  onSelectCol, onSelectAll, allSelected, sortBy, nameW, onNameWChange, onNameWAutoFit,
}: Props) {
  const closedSet = new Set(closedWeeks ?? []);
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
  const selHdr = "bg-[hsl(var(--plnx-sel-hdr))]";

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onNameWChange) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = nameW ?? 200;
      dragRef.current = { startX, startW };
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const next = Math.min(
          NAME_W_MAX,
          Math.max(NAME_W_MIN, dragRef.current.startW + (ev.clientX - dragRef.current.startX)),
        );
        onNameWChange(next);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [nameW, onNameWChange],
  );

  return (
    <thead>
      <tr className="h-[var(--plnx-hdr-1)]">
        <th
          aria-label="Seleccionar toda la hoja"
          title="Seleccionar toda la hoja"
          data-plnx-corner=""
          className={`${GUTTER_W} ${cornerBase} left-0 top-0 cursor-pointer border-ds-border-default ${allSelected ? selHdr : ""}`}
          onClick={() => onSelectAll?.()}
        />
        <th
          data-plnx-cola=""
          className={`planilla-name-col relative ${NAME_W} ${cornerBase} ${NAME_LEFT} top-0 cursor-pointer border-ds-border-default text-center text-ds-text-4 ${allSelected ? selHdr : ""}`}
          onClick={() => onSelectAll?.()}
          title="Seleccionar toda la hoja"
        >
          A
          {onNameWChange && (
            <span
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar columna Concepto"
              className="planilla-name-resize absolute right-0 top-0 z-50 hidden h-full w-2 translate-x-1/2 cursor-col-resize lg:block"
              onPointerDown={onResizePointerDown}
              onDoubleClick={(e) => { e.stopPropagation(); onNameWAutoFit?.(); }}
            />
          )}
        </th>
        {columns.map((c, i) => (
          <th
            key={c.key}
            className={`sticky top-0 z-30 ${COL_W} ${thBase} cursor-pointer text-center text-ds-text-4 ${c.isCurrent ? TODAY_COL : ""} ${selectedColIndices?.has(i) ? selHdr : ""}`}
            onClick={() => onSelectCol?.(i)}
            title="Seleccionar columna"
          >
            {columnLetter(i + 1)}
          </th>
        ))}
      </tr>
      <tr className="h-[var(--plnx-hdr-2)]">
        <th
          rowSpan={2}
          aria-label="Números de fila"
          className={`${GUTTER_W} ${cornerBase} left-0 top-[var(--plnx-hdr-1)] border-ds-border-default`}
        />
        <th
          rowSpan={2}
          className={`planilla-name-col relative ${NAME_W} ${cornerBase} ${NAME_LEFT} top-[var(--plnx-hdr-1)] border-ds-border-default px-1.5 max-md:px-1 text-left align-bottom pb-0.5 text-ds-text-3`}
        >
          Concepto
          {onNameWChange && (
            <span
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar columna Concepto"
              className="planilla-name-resize absolute right-0 top-0 z-50 hidden h-full w-2 translate-x-1/2 cursor-col-resize lg:block"
              onPointerDown={onResizePointerDown}
              onDoubleClick={(e) => { e.stopPropagation(); onNameWAutoFit?.(); }}
            />
          )}
        </th>
        {groups.map((g, i) => (
          <th key={i} colSpan={g.span} className={`sticky top-[var(--plnx-hdr-1)] z-30 ${thBase} overflow-hidden whitespace-nowrap text-center text-ds-text-2`}>
            {g.label}
          </th>
        ))}
      </tr>
      <tr className="h-[var(--plnx-hdr-3)]">
        {columns.map((c, i) => {
          const sortMark =
            sortBy && sortBy.weekStart === c.weekStart
              ? sortBy.dir === "desc" ? " ▼" : " ▲"
              : "";
          return (
            <th
              key={c.key}
              data-week={c.weekStart}
              data-current={c.isCurrent ? "true" : undefined}
              className={`sticky top-[calc(var(--plnx-hdr-1)+var(--plnx-hdr-2))] z-30 ${COL_W} ${thBase} cursor-pointer overflow-hidden whitespace-nowrap text-right ${
                c.isCurrent ? `${TODAY_COL} text-primary` : "text-ds-text-3"
              } ${selectedColIndices?.has(i) ? selHdr : ""}`}
              onClick={() => onSelectCol?.(i)}
              title="Seleccionar columna"
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
                  {sortMark && <span className="text-primary">{sortMark}</span>}
                </>
              ) : (
                <>{MONTHS[Number(c.monthKey.slice(5, 7)) - 1]} · {c.weekCount}s</>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
