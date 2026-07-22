"use client";

import { useCallback, useState } from "react";
import type { FlowMatrixResponse } from "@/modules/finance/flow-v3/matrix-types";

export interface CellSel {
  rowId: string;
  colIdx: number;
}

/**
 * Navegación estilo Sheets sobre la grilla: flechas mueven la selección,
 * Enter guarda y baja, Tab derecha, Esc cancela, tipear un dígito (o "-")
 * sobre una celda editable abre el input reemplazando el valor.
 */
export function usePlanillaKeyboard(opts: {
  data: FlowMatrixResponse | null;
  canEditCell: (rowId: string, colIdx: number) => boolean;
  onCommit: (rowId: string, colIdx: number, raw: string) => void;
  onOpenPopover: (sel: CellSel) => void;
  /** Ctrl/Cmd+D sobre celda editable: rellenar hacia la derecha (F3). */
  onFillRight?: (sel: CellSel) => void;
}) {
  const [sel, setSel] = useState<CellSel | null>(null);
  const [editing, setEditing] = useState<{ sel: CellSel; initial: string } | null>(null);

  const rowIds = opts.data?.rows.map((r) => r.id) ?? [];
  const colCount = opts.data?.columns.length ?? 0;

  const move = useCallback(
    (dRow: number, dCol: number) => {
      setSel((s) => {
        if (!s || rowIds.length === 0) return s;
        const ri = Math.min(Math.max(rowIds.indexOf(s.rowId) + dRow, 0), rowIds.length - 1);
        const ci = Math.min(Math.max(s.colIdx + dCol, 0), colCount - 1);
        return { rowId: rowIds[ri], colIdx: ci };
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
      if (moveAfter === "down") move(1, 0);
      else if (moveAfter === "right") move(0, 1);
    },
    [move, opts],
  );

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing) return; // el input inline maneja sus teclas
      if (!sel) return;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === "d" || k === "D")) {
        e.preventDefault();
        if (opts.canEditCell(sel.rowId, sel.colIdx)) opts.onFillRight?.(sel);
        return;
      }
      if (k === "ArrowDown") { e.preventDefault(); move(1, 0); }
      else if (k === "ArrowUp") { e.preventDefault(); move(-1, 0); }
      else if (k === "ArrowRight") { e.preventDefault(); move(0, 1); }
      else if (k === "ArrowLeft") { e.preventDefault(); move(0, -1); }
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
    [editing, sel, move, startEdit, opts],
  );

  return { sel, setSel, editing, setEditing, startEdit, commitEdit, onGridKeyDown };
}
