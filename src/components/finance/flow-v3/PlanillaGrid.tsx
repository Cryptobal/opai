"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FlowMatrixResponse, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { SECTION_H, SECTION_LABELS, SECTION_ORDER } from "./grid-classes";
import { parseSignedAmount } from "./format";
import { PlanillaHeader } from "./PlanillaHeader";
import { PlanillaRow } from "./PlanillaRow";
import { BalanceRow } from "./BalanceRow";
import { CellLayersPopover, type PopoverState } from "./CellLayersPopover";
import { usePlanillaKeyboard, type CellSel } from "./usePlanillaKeyboard";

interface Props {
  data: FlowMatrixResponse;
  canManage: boolean;
  patchPlan: (rowId: string, weekStart: string, amount: number) => Promise<void>;
  onRename: (rowId: string, name: string) => void;
  onArchive: (row: FlowMatrixRowDto) => void;
  onSetEndDate: (templateId: string, endDate: string | null) => void;
}

export function PlanillaGrid({ data, canManage, patchPlan, onRename, onArchive, onSetEndDate }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const rowById = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);

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

  const kb = usePlanillaKeyboard({
    data,
    canEditCell,
    onCommit: commit,
    onOpenPopover: (sel) => openPopover(sel),
  });

  const sections = SECTION_ORDER.map((s) => ({
    key: s,
    rows: data.rows.filter((r) => r.section === s),
  })).filter((s) => s.rows.length > 0);

  const toggleSection = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div
      tabIndex={0}
      onKeyDown={kb.onGridKeyDown}
      className="relative max-h-[calc(100dvh-190px)] overflow-auto overscroll-contain rounded-lg border border-ds-border-default bg-ds-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      onScroll={() => popover && setPopover(null)}
    >
      <table className="w-max border-separate border-spacing-0">
        <PlanillaHeader columns={data.columns} granularity={data.granularity} />
        {sections.map((section) => (
          <tbody key={section.key}>
            <tr className={SECTION_H}>
              <th
                scope="rowgroup"
                colSpan={data.columns.length + 1}
                className={`${SECTION_H} sticky left-0 z-10 border-b border-ds-border-default bg-ds-surface-2 px-1.5 text-left`}
              >
                <button
                  onClick={() => toggleSection(section.key)}
                  className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-ds-text-2"
                >
                  {collapsed.has(section.key) ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {SECTION_LABELS[section.key]}
                  <span className="text-ds-text-4">({section.rows.length})</span>
                </button>
              </th>
            </tr>
            {!collapsed.has(section.key) &&
              section.rows.map((row) => (
                <PlanillaRow
                  key={row.id}
                  row={row}
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
        />
      </table>
      <CellLayersPopover
        state={popover}
        canManage={canManage}
        onClose={() => setPopover(null)}
        onSetEndDate={onSetEndDate}
      />
    </div>
  );
}
