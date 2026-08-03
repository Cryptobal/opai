"use client";

import { useCallback, useState } from "react";
import type { FlowMatrixResponse } from "@/modules/finance/flow-v3/matrix-types";
import type { RangeSel } from "./range-sel";

export interface CellSel {
  rowId: string;
  colIdx: number;
}

/**
 * Navegación estilo Sheets: flechas mueven head; shift+flechas extienden
 * desde el ancla. Enter/Tab/tipeo editan la celda head.
 */
export function usePlanillaKeyboard(opts: {
  data: FlowMatrixResponse | null;
  canEditCell: (rowId: string, colIdx: number) => boolean;
  onCommit: (rowId: string, colIdx: number, raw: string) => void;
  onOpenPopover: (sel: CellSel) => void;
  onFillRight?: (sel: CellSel) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** ⌘C: copiar rango (delegado al cliente). */
  onCopy?: () => void;
}) {
  const [range, setRange] = useState<RangeSel | null>(null);
  const [editing, setEditing] = useState<{ sel: CellSel; initial: string } | null>(null);

  const rowIds = opts.data?.rows.map((r) => r.id) ?? [];
  const colCount = opts.data?.columns.length ?? 0;
  const sel = range?.head ?? null;

  const setSel = useCallback((s: CellSel | null) => {
    setRange(s ? { anchor: s, head: s } : null);
  }, []);

  const extendTo = useCallback((s: CellSel) => {
    setRange((r) => (r ? { anchor: r.anchor, head: s } : { anchor: s, head: s }));
  }, []);

  const selectRow = useCallback(
    (rowId: string) => {
      if (colCount <= 0 || !rowIds.includes(rowId)) return;
      setRange({
        anchor: { rowId, colIdx: 0 },
        head: { rowId, colIdx: colCount - 1 },
      });
    },
    [colCount, rowIds],
  );

  const selectCol = useCallback(
    (colIdx: number) => {
      if (rowIds.length === 0 || colIdx < 0 || colIdx >= colCount) return;
      setRange({
        anchor: { rowId: rowIds[0], colIdx },
        head: { rowId: rowIds[rowIds.length - 1], colIdx },
      });
    },
    [rowIds, colCount],
  );

  const move = useCallback(
    (dRow: number, dCol: number, extend: boolean) => {
      setRange((r) => {
        if (!r || rowIds.length === 0) return r;
        const base = r.head;
        const ri = Math.min(Math.max(rowIds.indexOf(base.rowId) + dRow, 0), rowIds.length - 1);
        const ci = Math.min(Math.max(base.colIdx + dCol, 0), colCount - 1);
        const next = { rowId: rowIds[ri], colIdx: ci };
        return extend ? { anchor: r.anchor, head: next } : { anchor: next, head: next };
      });
    },
    [rowIds, colCount],
  );

  const startEdit = useCallback(
    (s: CellSel, initial: string) => {
      if (!opts.canEditCell(s.rowId, s.colIdx)) return;
      setEditing({ sel: s, initial });
    },
    [opts],
  );

  const commitEdit = useCallback(
    (raw: string, moveAfter: "down" | "right" | "none") => {
      setEditing((e) => {
        if (e) opts.onCommit(e.sel.rowId, e.sel.colIdx, raw);
        return null;
      });
      if (moveAfter === "down") move(1, 0, false);
      else if (moveAfter === "right") move(0, 1, false);
    },
    [move, opts],
  );

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (k === "z" || k === "Z")) {
        e.preventDefault();
        if (e.shiftKey) opts.onRedo?.();
        else opts.onUndo?.();
        return;
      }
      if (mod && (k === "y" || k === "Y")) {
        e.preventDefault();
        opts.onRedo?.();
        return;
      }
      if (mod && (k === "c" || k === "C")) {
        e.preventDefault();
        opts.onCopy?.();
        return;
      }
      if (!sel || !range) return;
      if (mod && (k === "d" || k === "D")) {
        e.preventDefault();
        if (opts.canEditCell(sel.rowId, sel.colIdx)) opts.onFillRight?.(sel);
        return;
      }
      if (k === "ArrowDown") { e.preventDefault(); move(1, 0, e.shiftKey); }
      else if (k === "ArrowUp") { e.preventDefault(); move(-1, 0, e.shiftKey); }
      else if (k === "ArrowRight") { e.preventDefault(); move(0, 1, e.shiftKey); }
      else if (k === "ArrowLeft") { e.preventDefault(); move(0, -1, e.shiftKey); }
      else if (k === "Enter") { e.preventDefault(); startEdit(sel, ""); }
      else if (k === " ") { e.preventDefault(); opts.onOpenPopover(sel); }
      else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        if (opts.canEditCell(sel.rowId, sel.colIdx)) opts.onCommit(sel.rowId, sel.colIdx, "0");
      } else if (/^[0-9-]$/.test(k)) {
        e.preventDefault();
        startEdit(sel, k);
      }
    },
    [editing, sel, range, move, startEdit, opts],
  );

  return {
    sel,
    range,
    setSel,
    extendTo,
    selectRow,
    selectCol,
    setRange,
    editing,
    setEditing,
    startEdit,
    commitEdit,
    onGridKeyDown,
    isEditing: editing != null,
  };
}
