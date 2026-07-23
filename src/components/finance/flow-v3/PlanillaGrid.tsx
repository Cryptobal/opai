"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FlowMatrixResponse, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import {
  GUTTER_CELL, GUTTER_W, isZeroRow, NAME_LEFT, NAME_W, SECTION_H, SECTION_LABELS, SECTION_ORDER,
} from "./grid-classes";
import { parseSignedAmount } from "./format";
import { PlanillaHeader } from "./PlanillaHeader";
import { PlanillaRow } from "./PlanillaRow";
import { BalanceRow } from "./BalanceRow";
import { CellLayersPopover, type PopoverState } from "./CellLayersPopover";
import { FillRightDialog, type FillRightRequest } from "./FillRightDialog";
import { usePlanillaKeyboard, type CellSel } from "./usePlanillaKeyboard";

interface Props {
  data: FlowMatrixResponse;
  canManage: boolean;
  busy: boolean;
  patchPlan: (rowId: string, weekStart: string, amount: number) => Promise<void>;
  onRename: (rowId: string, name: string) => void;
  onArchive: (row: FlowMatrixRowDto) => void;
  onSetEndDate: (templateId: string, endDate: string | null) => void;
  onSetDiasCobro: (templateId: string, diasCobro: number | null) => void;
  onBulkFill: (rowId: string, weekStarts: string[], amount: number) => Promise<unknown>;
  /** Mostrar filas completamente en cero (por defecto van ocultas). */
  showZeros: boolean;
  /** Filas exentas del filtro de ceros (recién creadas en esta sesión). */
  alwaysVisibleRowIds?: Set<string>;
  /** Ref del contenedor scrollable (la toolbar lo usa para ‹/›/Hoy). */
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
}

/** Semana de anclaje al abrir/"Hoy": la ANTERIOR a la actual como primera
 *  columna visible (la actual queda segunda — pedido del owner). */
export function anchorTargetWeek(data: FlowMatrixResponse): string {
  const idx = data.columns.findIndex((c) => c.isCurrent);
  return data.columns[Math.max(0, idx - 1)]?.key ?? data.currentWeek;
}

/** Desplaza el scroller para que `weekStart` quede como primera semana visible
 *  (después del gutter + Concepto sticky). */
export function scrollToWeek(el: HTMLElement, weekStart: string, smooth = true) {
  const th =
    el.querySelector<HTMLElement>(`[data-week="${weekStart}"]`) ??
    el.querySelector<HTMLElement>(`[data-week][data-current="true"]`);
  if (!th) return;
  const frozen =
    (el.querySelector<HTMLElement>("[data-plnx-corner]")?.offsetWidth ?? 0) +
    (el.querySelector<HTMLElement>("[data-plnx-cola]")?.offsetWidth ?? 0);
  el.scrollTo({ left: Math.max(0, th.offsetLeft - frozen), behavior: smooth ? "smooth" : "auto" });
}

export function PlanillaGrid({
  data, canManage, busy, patchPlan, onRename, onArchive, onSetEndDate,
  onSetDiasCobro, onBulkFill, showZeros, alwaysVisibleRowIds, scrollerRef,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [fillRight, setFillRight] = useState<FillRightRequest | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const scroller = scrollerRef ?? localRef;

  const rowById = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);

  // Secciones con filtro de ceros: las filas sin ninguna capa en el horizonte
  // se ocultan por defecto; las estructurales (sección/resumen) permanecen.
  const sections = useMemo(() => {
    return SECTION_ORDER.map((s) => {
      const all = data.rows.filter((r) => r.section === s);
      const rows = showZeros
        ? all
        : all.filter((r) => !isZeroRow(r) || alwaysVisibleRowIds?.has(r.id));
      return { key: s, rows, total: all.length };
    }).filter((s) => s.total > 0);
  }, [data.rows, showZeros, alwaysVisibleRowIds]);

  // Numeración del gutter: correlativo de las filas RENDERIZADAS de la hoja
  // (secciones, datos y resumen), como los números de una planilla.
  const { numbered, footerStart } = useMemo(() => {
    let n = 1;
    const out = sections.map((sec) => {
      const secNumber = n++;
      const rows = (collapsed.has(sec.key) ? [] : sec.rows).map((row) => ({ row, number: n++ }));
      return { ...sec, secNumber, numberedRows: rows };
    });
    return { numbered: out, footerStart: n };
  }, [sections, collapsed]);

  // La navegación por teclado opera SOLO sobre filas visibles.
  const kbData = useMemo(
    () => ({ ...data, rows: numbered.flatMap((s) => s.numberedRows.map((x) => x.row)) }),
    [data, numbered],
  );

  const canEditCell = useCallback(
    (rowId: string, colIdx: number) => {
      const row = rowById.get(rowId);
      const col = data.columns[colIdx];
      return (
        !!row && !!col && canManage && data.granularity === "week" &&
        !row.isArchived && !row.isVirtual && !col.isPast
      );
    },
    [rowById, data.columns, data.granularity, canManage],
  );

  const commit = useCallback(
    (rowId: string, colIdx: number, raw: string) => {
      const col = data.columns[colIdx];
      if (!col || !canEditCell(rowId, colIdx)) return;
      void patchPlan(rowId, col.key, parseSignedAmount(raw || "0"));
    },
    [data.columns, canEditCell, patchPlan],
  );

  const openPopover = useCallback(
    (sel: CellSel, anchor?: DOMRect) => {
      const row = rowById.get(sel.rowId);
      const cell = row?.cells[sel.colIdx];
      if (!row || !cell) return;
      const rect =
        anchor ??
        document.querySelector(`[data-rc="${sel.rowId}:${sel.colIdx}"]`)?.getBoundingClientRect();
      if (!rect) return;
      setPopover({ row, cell, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
    },
    [rowById],
  );

  const requestFillRight = useCallback(
    (sel: CellSel) => {
      const row = rowById.get(sel.rowId);
      const cell = row?.cells[sel.colIdx];
      if (!row || !cell || data.granularity !== "week") return;
      const weeksRight = data.columns
        .slice(sel.colIdx + 1)
        .filter((c) => !c.isPast)
        .map((c) => c.key);
      if (weeksRight.length === 0) return;
      setFillRight({
        rowId: row.id,
        rowName: row.name,
        fromWeek: cell.weekStart,
        weeksRight,
        amount: cell.plan,
      });
    },
    [rowById, data.columns, data.granularity],
  );

  const kb = usePlanillaKeyboard({
    data: kbData,
    canEditCell,
    onCommit: commit,
    onOpenPopover: (sel) => openPopover(sel),
    onFillRight: requestFillRight,
  });

  // Anclaje inicial en teléfonos: semana ANTERIOR primera, actual segunda
  // (el resto de la historia queda a la izquierda con scroll nativo). Solo
  // una vez por montaje.
  const anchoredRef = useRef(false);
  useEffect(() => {
    if (anchoredRef.current || data.granularity !== "week") return;
    const el = scroller.current;
    if (!el) return;
    anchoredRef.current = true;
    if (window.matchMedia("(max-width: 767px)").matches) {
      scrollToWeek(el, anchorTargetWeek(data), false);
    }
  }, [data, scroller]);

  const toggleSection = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div
      ref={scroller}
      tabIndex={0}
      onKeyDown={kb.onGridKeyDown}
      className="planilla-sheet relative max-h-[var(--plnx-grid-h)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] rounded-lg border border-ds-border-default bg-ds-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/40 max-lg:rounded-none max-lg:border-x-0"
      onScroll={() => popover && setPopover(null)}
    >
      <table className="w-max border-separate border-spacing-0">
        <PlanillaHeader columns={data.columns} granularity={data.granularity} />
        {numbered.map((section) => (
          <tbody key={section.key}>
            {/* El label vive en la columna Concepto (sticky con holgura real);
                un th colSpan de toda la fila no puede quedarse fijo al hacer
                scroll horizontal (sin margen de desplazamiento). */}
            <tr className={SECTION_H}>
              <td aria-hidden className={`${GUTTER_W} ${SECTION_H} ${GUTTER_CELL} z-10`}>
                {section.secNumber}
              </td>
              <th
                scope="rowgroup"
                className={`${NAME_W} ${SECTION_H} sticky ${NAME_LEFT} z-10 border-b border-r border-ds-border-default bg-ds-surface-2 px-1.5 max-md:px-1 text-left`}
              >
                <button
                  onClick={() => toggleSection(section.key)}
                  className="flex w-full min-w-0 items-center gap-1 max-md:gap-0.5 overflow-hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-wide leading-none text-ds-text-2"
                >
                  {collapsed.has(section.key) ? (
                    <ChevronRight className="h-3 w-3 shrink-0 max-md:h-2.5 max-md:w-2.5" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0 max-md:h-2.5 max-md:w-2.5" />
                  )}
                  <span className="truncate">{SECTION_LABELS[section.key]}</span>
                  {/* Contador: completo en desktop; en móvil solo si hay filas
                      ocultas por el filtro de ceros (columna A angosta). */}
                  {section.rows.length === section.total ? (
                    <span className="shrink-0 text-ds-text-4 max-md:hidden">({section.total})</span>
                  ) : (
                    <span className="shrink-0 text-ds-text-4">
                      <span className="md:hidden">{section.rows.length}/{section.total}</span>
                      <span className="max-md:hidden">({section.rows.length}/{section.total})</span>
                    </span>
                  )}
                </button>
              </th>
              <td
                aria-hidden
                colSpan={data.columns.length}
                className={`${SECTION_H} border-b border-ds-border-default bg-ds-surface-2`}
              />
            </tr>
            {section.numberedRows.map(({ row, number }) => (
              <PlanillaRow
                key={row.id}
                row={row}
                rowNumber={number}
                currentWeek={data.currentWeek}
                canManage={canManage}
                granularity={data.granularity}
                sel={kb.sel}
                editing={kb.editing}
                onSelect={(sel) => { setPopover(null); kb.setSel(sel); }}
                onStartEdit={(sel) => { setPopover(null); kb.setSel(sel); kb.startEdit(sel, ""); }}
                onCommit={kb.commitEdit}
                onCancelEdit={() => kb.setEditing(null)}
                onOpenPopover={(sel, anchor) => { kb.setSel(sel); openPopover(sel, anchor); }}
                onRename={onRename}
                onArchive={onArchive}
              />
            ))}
          </tbody>
        ))}
        <BalanceRow
          columns={data.columns}
          flows={data.flows}
          balances={data.balances}
          warnThreshold={data.warnThreshold}
          startNumber={footerStart}
        />
      </table>
      <CellLayersPopover
        state={popover}
        canManage={canManage}
        onClose={() => setPopover(null)}
        onSetEndDate={onSetEndDate}
        onSetDiasCobro={onSetDiasCobro}
      />
      <FillRightDialog
        request={fillRight}
        busy={busy}
        onClose={() => setFillRight(null)}
        onConfirm={onBulkFill}
      />
    </div>
  );
}
