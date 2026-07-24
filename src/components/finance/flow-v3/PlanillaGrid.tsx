"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FlowMatrixResponse, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ContextMenu, ContextMenuContent, ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { MenuItems } from "./menu-render";
import {
  buildCellMenu, buildRowMenu, extractRowTemplates, type RowTemplate,
} from "./menu-builders";
import {
  ChangeCategoryDialog, ChangeSectionDialog, DeferTermDialog, DiasCobroDialog,
} from "./RowDialogs";
import { RecurringExpenseDialog } from "./RecurringExpenseDialog";
import type { HistoryEntry } from "./usePlanillaHistory";
import type { usePlanillaActions } from "./usePlanillaActions";

interface PlanMutators {
  patchPlan: (rowId: string, weekStart: string, amount: number, opts?: { skipHistory?: boolean }) => Promise<void>;
  patchPlanBulk: (rowId: string, weekStarts: string[], amount: number, opts?: { skipHistory?: boolean }) => Promise<unknown>;
  movePlan: (rowId: string, from: string, to: string, opts?: { skipHistory?: boolean }) => Promise<unknown>;
  undo: () => Promise<HistoryEntry | null>;
  redo: () => Promise<HistoryEntry | null>;
}

interface Props {
  data: FlowMatrixResponse;
  canManage: boolean;
  matrix: PlanMutators;
  actions: ReturnType<typeof usePlanillaActions>;
  /** Archivar dispara el flujo de confirmación del cliente (warning de programación). */
  onArchive: (row: FlowMatrixRowDto) => void;
  enableDrag: boolean;
  showZeros: boolean;
  alwaysVisibleRowIds?: Set<string>;
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
}

type RowDialogState =
  | { kind: "section"; row: FlowMatrixRowDto }
  | { kind: "category"; row: FlowMatrixRowDto }
  | { kind: "defer"; row: FlowMatrixRowDto; template: RowTemplate }
  | { kind: "dias"; row: FlowMatrixRowDto; template: RowTemplate }
  | { kind: "recurring"; row: FlowMatrixRowDto }
  | { kind: "delete"; row: FlowMatrixRowDto }
  | { kind: "deleteBlocked"; row: FlowMatrixRowDto; reason: string }
  | null;

type CtxTarget = { kind: "cell"; sel: CellSel } | { kind: "row"; rowId: string } | null;

/** Semana de anclaje al abrir/"Hoy": la ANTERIOR a la actual como primera columna. */
export function anchorTargetWeek(data: FlowMatrixResponse): string {
  const idx = data.columns.findIndex((c) => c.isCurrent);
  return data.columns[Math.max(0, idx - 1)]?.key ?? data.currentWeek;
}

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
  data, canManage, matrix, actions, onArchive, enableDrag,
  showZeros, alwaysVisibleRowIds, scrollerRef,
}: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [fillRight, setFillRight] = useState<FillRightRequest | null>(null);
  const [renamingRowId, setRenamingRowId] = useState<string | null>(null);
  const [rowDialog, setRowDialog] = useState<RowDialogState>(null);
  const [ctxTarget, setCtxTarget] = useState<CtxTarget>(null);
  const [dropTarget, setDropTarget] = useState<{ rowId: string; colIdx: number } | null>(null);
  const dragRef = useRef<{ rowId: string; week: string } | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const scroller = scrollerRef ?? localRef;
  const kbRef = useRef<ReturnType<typeof usePlanillaKeyboard> | null>(null);

  const rowById = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);
  const closedSet = useMemo(() => new Set(data.closedWeeks), [data.closedWeeks]);

  const sections = useMemo(() => {
    return SECTION_ORDER.map((s) => {
      const all = data.rows.filter((r) => r.section === s);
      const rows = showZeros
        ? all
        : all.filter((r) => !isZeroRow(r) || alwaysVisibleRowIds?.has(r.id));
      return { key: s, rows, total: all.length };
    }).filter((s) => s.total > 0);
  }, [data.rows, showZeros, alwaysVisibleRowIds]);

  const { numbered, footerStart } = useMemo(() => {
    let n = 1;
    const out = sections.map((sec) => {
      const secNumber = n++;
      const rows = (collapsed.has(sec.key) ? [] : sec.rows).map((row) => ({ row, number: n++ }));
      return { ...sec, secNumber, numberedRows: rows };
    });
    return { numbered: out, footerStart: n };
  }, [sections, collapsed]);

  const kbData = useMemo(
    () => ({ ...data, rows: numbered.flatMap((s) => s.numberedRows.map((x) => x.row)) }),
    [data, numbered],
  );

  /** ¿La columna admite escritura de plan? (no pasada, no sellada, semanal). */
  const colWritable = useCallback(
    (colIdx: number) => {
      const col = data.columns[colIdx];
      return !!col && data.granularity === "week" && !col.isPast && !closedSet.has(col.key);
    },
    [data.columns, data.granularity, closedSet],
  );

  const canEditCell = useCallback(
    (rowId: string, colIdx: number) => {
      const row = rowById.get(rowId);
      return (
        !!row && canManage && !row.isArchived && !row.isVirtual && colWritable(colIdx)
      );
    },
    [rowById, canManage, colWritable],
  );

  const commit = useCallback(
    (rowId: string, colIdx: number, raw: string) => {
      const col = data.columns[colIdx];
      if (!col || !canEditCell(rowId, colIdx)) return;
      void matrix.patchPlan(rowId, col.key, parseSignedAmount(raw || "0"));
    },
    [data.columns, canEditCell, matrix],
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
        .filter((c) => !c.isPast && !closedSet.has(c.key))
        .map((c) => c.key);
      if (weeksRight.length === 0) return;
      setFillRight({
        rowId: row.id, rowName: row.name, fromWeek: cell.weekStart, weeksRight, amount: cell.plan,
      });
    },
    [rowById, data.columns, data.granularity, closedSet],
  );

  // ── Deshacer / rehacer: aplica foco + toast tras la operación del matrix. ──
  const applyHistoryResult = useCallback(
    (entry: HistoryEntry | null, verb: string) => {
      if (!entry) return;
      if (entry.focus) {
        kbRef.current?.setSel(entry.focus);
        const col = data.columns[entry.focus.colIdx];
        if (col && scroller.current) scrollToWeek(scroller.current, col.key);
      }
      setPopover(null);
      toast.message(`${verb}: ${entry.label}`);
    },
    [data.columns, scroller],
  );
  const handleUndo = useCallback(async () => {
    applyHistoryResult(await matrix.undo(), "Deshecho");
  }, [matrix, applyHistoryResult]);
  const handleRedo = useCallback(async () => {
    applyHistoryResult(await matrix.redo(), "Rehecho");
  }, [matrix, applyHistoryResult]);

  const kb = usePlanillaKeyboard({
    data: kbData,
    canEditCell,
    onCommit: commit,
    onOpenPopover: (sel) => openPopover(sel),
    onFillRight: requestFillRight,
    onUndo: () => void handleUndo(),
    onRedo: () => void handleRedo(),
  });
  kbRef.current = kb;

  // ── Drag & drop de plan (desktop). ──
  const onCellDragStart = useCallback((rowId: string, week: string) => {
    dragRef.current = { rowId, week };
  }, []);
  const onCellDragOver = useCallback(
    (e: React.DragEvent, rowId: string, colIdx: number, week: string) => {
      const src = dragRef.current;
      if (src && src.rowId === rowId && src.week !== week && canEditCell(rowId, colIdx)) {
        e.preventDefault();
        setDropTarget((t) => (t?.rowId === rowId && t.colIdx === colIdx ? t : { rowId, colIdx }));
      }
    },
    [canEditCell],
  );
  const onCellDrop = useCallback(
    (rowId: string, week: string) => {
      const src = dragRef.current;
      dragRef.current = null;
      setDropTarget(null);
      if (src && src.rowId === rowId && src.week !== week) {
        void matrix.movePlan(rowId, src.week, week);
      }
    },
    [matrix],
  );
  const onCellDragEnd = useCallback(() => {
    dragRef.current = null;
    setDropTarget(null);
  }, []);

  // ── Callbacks de menú de fila / celda. ──
  const rowCallbacks = useMemo(
    () => ({
      onRename: (row: FlowMatrixRowDto) => setRenamingRowId(row.id),
      onChangeSection: (row: FlowMatrixRowDto) => setRowDialog({ kind: "section", row }),
      onChangeCategory: (row: FlowMatrixRowDto) => setRowDialog({ kind: "category", row }),
      onDeferTerm: (row: FlowMatrixRowDto, template: RowTemplate) => setRowDialog({ kind: "defer", row, template }),
      onSetDiasCobro: (row: FlowMatrixRowDto, template: RowTemplate) => setRowDialog({ kind: "dias", row, template }),
      onRecurring: (row: FlowMatrixRowDto) => setRowDialog({ kind: "recurring", row }),
      onArchive,
      onUnarchive: (row: FlowMatrixRowDto) => void actions.unarchiveRow(row.id),
      onDelete: (row: FlowMatrixRowDto) => setRowDialog({ kind: "delete", row }),
    }),
    [actions, onArchive],
  );

  const cellCallbacksFor = useCallback(
    (sel: CellSel, week: string) => ({
      onEditAmount: () => {
        setPopover(null);
        kb.setSel(sel);
        kb.startEdit(sel, "");
      },
      onFillRight: () => requestFillRight(sel),
      onClearPlan: () => void matrix.patchPlan(sel.rowId, week, 0),
      onMovePlan: (target: string) => void matrix.movePlan(sel.rowId, week, target),
      onViewDetail: () => openPopover(sel),
      onViewDte: (dteId: string) => router.push(`/finanzas/facturacion/dtes?dte=${dteId}`),
    }),
    [kb, matrix, openPopover, requestFillRight, router],
  );

  const rowMenuFor = useCallback(
    (row: FlowMatrixRowDto) => buildRowMenu(row, extractRowTemplates(row), rowCallbacks),
    [rowCallbacks],
  );

  const ctxItems = useMemo(() => {
    if (!ctxTarget) return null;
    if (ctxTarget.kind === "row") {
      const row = rowById.get(ctxTarget.rowId);
      return row ? rowMenuFor(row) : null;
    }
    const { rowId, colIdx } = ctxTarget.sel;
    const row = rowById.get(rowId);
    const cell = row?.cells[colIdx];
    const col = data.columns[colIdx];
    if (!row || !cell || !col) return null;
    const editable = canEditCell(rowId, colIdx);
    const reason = !canManage
      ? "Sin permiso de edición"
      : data.granularity !== "week"
        ? "Cambia a vista semanal"
        : row.isVirtual
          ? "Fila calculada"
          : row.isArchived
            ? "Fila archivada"
            : col.isPast
              ? "Semana pasada (solo real)"
              : closedSet.has(col.key)
                ? "Semana cerrada"
                : "";
    const openWeeks = data.columns.filter((_, i) => i !== colIdx && canEditCell(rowId, i));
    return buildCellMenu(row, cell, { editable, reason, openWeeks }, cellCallbacksFor(ctxTarget.sel, col.key));
  }, [ctxTarget, rowById, data.columns, data.granularity, canEditCell, canManage, closedSet, rowMenuFor, cellCallbacksFor]);

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

  const busy = actions.busy;

  return (
    <>
      {/* modal={false}: un ContextMenu modal pone `pointer-events:none` en <body>
          mientras está abierto y lo restaura al cerrar desde el efecto de
          desmontaje de su Content. Como el Content se renderiza condicionalmente
          (depende de ctxItems), al cerrar se desmontaba antes de restaurar y la
          página quedaba congelada hasta refrescar. No-modal elimina ese bloqueo
          (el menú igual se cierra con click afuera / Escape). */}
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            tabIndex={0}
            onKeyDown={kb.onGridKeyDown}
            onContextMenuCapture={() => setCtxTarget(null)}
            className="planilla-sheet relative max-h-[var(--plnx-grid-h)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] rounded-lg border border-ds-border-default bg-ds-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/40 max-lg:rounded-none max-lg:border-x-0"
            onScroll={() => popover && setPopover(null)}
          >
            <table className="w-max border-separate border-spacing-0">
              <PlanillaHeader columns={data.columns} granularity={data.granularity} closedWeeks={data.closedWeeks} />
              {numbered.map((section) => (
                <tbody key={section.key}>
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
                      isRenaming={renamingRowId === row.id}
                      onRenameCommit={(name) => { setRenamingRowId(null); void actions.renameRow(row.id, name); }}
                      onRenameCancel={() => setRenamingRowId(null)}
                      rowMenu={rowMenuFor(row)}
                      onRowContext={() => setCtxTarget({ kind: "row", rowId: row.id })}
                      colWritable={colWritable}
                      enableDrag={enableDrag}
                      dropTarget={dropTarget}
                      onCellContext={(sel) => setCtxTarget({ kind: "cell", sel })}
                      onCellDragStart={onCellDragStart}
                      onCellDragOver={onCellDragOver}
                      onCellDrop={onCellDrop}
                      onCellDragEnd={onCellDragEnd}
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
          </div>
        </ContextMenuTrigger>
        {ctxItems && ctxItems.length > 0 && (
          <ContextMenuContent className="max-h-96 overflow-y-auto">
            <MenuItems items={ctxItems} variant="context" />
          </ContextMenuContent>
        )}
      </ContextMenu>

      <CellLayersPopover state={popover} onClose={() => setPopover(null)} />
      <FillRightDialog
        request={fillRight}
        busy={busy}
        onClose={() => setFillRight(null)}
        onConfirm={(rowId, weeks, amount) => matrix.patchPlanBulk(rowId, weeks, amount)}
      />

      <ChangeSectionDialog
        row={rowDialog?.kind === "section" ? rowDialog.row : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (section) => {
          if (rowDialog?.kind !== "section") return;
          await actions.updateRow(rowDialog.row.id, { section });
          setRowDialog(null);
        }}
      />
      <ChangeCategoryDialog
        row={rowDialog?.kind === "category" ? rowDialog.row : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (categoryId) => {
          if (rowDialog?.kind !== "category") return;
          await actions.updateRow(rowDialog.row.id, { categoryId });
          setRowDialog(null);
        }}
      />
      <DeferTermDialog
        template={rowDialog?.kind === "defer" ? rowDialog.template : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (endDate) => {
          if (rowDialog?.kind !== "defer") return;
          await actions.setTemplateEndDate(rowDialog.template.templateId, endDate);
          setRowDialog(null);
        }}
      />
      <DiasCobroDialog
        template={rowDialog?.kind === "dias" ? rowDialog.template : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (dias) => {
          if (rowDialog?.kind !== "dias") return;
          await actions.setTemplateDiasCobro(rowDialog.template.templateId, dias);
          setRowDialog(null);
        }}
      />
      <RecurringExpenseDialog
        row={rowDialog?.kind === "recurring" ? rowDialog.row : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={(body) => actions.createRecurring(body)}
      />

      <ConfirmDialog
        open={rowDialog?.kind === "delete"}
        onOpenChange={(o) => !o && setRowDialog(null)}
        title={`Eliminar «${rowDialog?.kind === "delete" ? rowDialog.row.name : ""}»`}
        description="La fila se elimina definitivamente. Solo es posible si no tiene plan, comprometido ni real en ninguna semana."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={async () => {
          if (rowDialog?.kind !== "delete") return;
          const row = rowDialog.row;
          const r = await actions.deleteRow(row.id);
          if (r.ok) setRowDialog(null);
          else setRowDialog({ kind: "deleteBlocked", row, reason: r.reason });
        }}
      />
      <ConfirmDialog
        open={rowDialog?.kind === "deleteBlocked"}
        onOpenChange={(o) => !o && setRowDialog(null)}
        variant="default"
        title="No se puede eliminar la fila"
        description={
          rowDialog?.kind === "deleteBlocked"
            ? `${rowDialog.reason}. ¿Archivarla en su lugar? (se oculta hacia adelante y conserva el histórico).`
            : ""
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        loading={busy}
        onConfirm={() => {
          if (rowDialog?.kind !== "deleteBlocked") return;
          onArchive(rowDialog.row);
          setRowDialog(null);
        }}
      />
    </>
  );
}
