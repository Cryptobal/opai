"use client";

import {
  forwardRef, useCallback, useImperativeHandle, useRef, useState,
} from "react";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { buildHoverCardContent } from "./cell-hover-content";
import { CellHoverCardBody } from "./CellHoverCardBody";

export interface CellHoverShowCtx {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  colIdx: number;
  rowNumber: number;
  isPast: boolean;
  reason?: string;
}

export interface CellHoverCardHandle {
  show: (ctx: CellHoverShowCtx, rect: DOMRect) => void;
  hide: () => void;
  /** Cierra aunque esté anclada (Esc / selección nueva / clic fuera). */
  forceHide: () => void;
  pin: () => void;
  unpin: () => void;
  flush: () => Promise<void>;
  openNoteEditor: () => void;
  isPinned: () => boolean;
  isVisible: () => boolean;
}

interface Props {
  canManage: boolean;
  onSaveNote: (rowId: string, weekStart: string, body: string | null) => Promise<boolean>;
  onOpenActions: (ctx: CellHoverShowCtx, anchor: DOMRect) => void;
}

/**
 * Ficha de detalle de instancia única. Se abre con clic izquierdo (anclada);
 * se cierra con Esc, clic fuera, scroll o al pasar a edición.
 */
export const CellHoverCard = forwardRef<CellHoverCardHandle, Props>(function CellHoverCard(
  { canManage, onSaveNote, onOpenActions },
  ref,
) {
  const [ctx, setCtx] = useState<CellHoverShowCtx | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const pinnedRef = useRef(false);
  const visibleRef = useRef(false);
  pinnedRef.current = pinned;
  visibleRef.current = visible;

  const place = useCallback((rect: DOMRect, itemCount = 0) => {
    const w = 288;
    // Lista scrollable ~max-h-56; estimar alto para no abrir fuera de viewport.
    const listH = itemCount > 0 ? Math.min(224, itemCount * 36) : 0;
    // +~56px si hay tip contextual de colores.
    const estH = 216 + listH;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    let top = rect.bottom + 4;
    if (top + estH > window.innerHeight - 8) top = Math.max(8, rect.top - estH - 4);
    setPos({ left, top });
  }, []);

  const hardHide = useCallback(() => {
    setPinned(false);
    setEditingNote(false);
    setVisible(false);
    setCtx(null);
  }, []);

  useImperativeHandle(ref, () => ({
    show(next, rect) {
      const itemCount =
        next.cell.layer === "real"
          ? (next.cell.real?.items.length ?? 0)
          : next.cell.layer === "committed"
            ? (next.cell.committed?.items.length ?? 0)
            : 0;
      setCtx(next);
      place(rect, itemCount);
      setVisible(true);
      setPinned(true);
      setEditingNote(false);
    },
    hide() {
      if (pinnedRef.current) return;
      setVisible(false);
      setEditingNote(false);
      setCtx(null);
    },
    forceHide: hardHide,
    pin() { setPinned(true); },
    unpin() { setPinned(false); },
    async flush() {},
    openNoteEditor() {
      setPinned(true);
      setEditingNote(true);
      setVisible(true);
    },
    isPinned: () => pinnedRef.current,
    isVisible: () => visibleRef.current,
  }), [place, hardHide]);

  if (!visible || !ctx) return null;

  const model = buildHoverCardContent({
    row: ctx.row, cell: ctx.cell, colIdx: ctx.colIdx,
    rowNumber: ctx.rowNumber, isPast: ctx.isPast, reason: ctx.reason,
  });

  return (
    <div
      className="planilla-cell-hover fixed z-50 w-[288px] rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-[13px] shadow-lg"
      data-visible="true"
      role="dialog"
      aria-label={editingNote ? `Nota · ${model.concept}` : `Detalle · ${model.concept}`}
      style={{ left: pos.left, top: pos.top }}
      onWheel={(e) => e.stopPropagation()}
    >
      <CellHoverCardBody
        model={model}
        editingNote={editingNote}
        canManage={canManage}
        rowId={ctx.row.id}
        weekStart={ctx.cell.weekStart}
        noteInitial={ctx.cell.note ?? ""}
        onSaveNote={onSaveNote}
        onStartNote={() => { if (canManage) { setPinned(true); setEditingNote(true); } }}
        onNoteClose={() => {
          setEditingNote(false);
          setPinned(true);
        }}
        onNoteDone={() => {
          setEditingNote(false);
          setPinned(true);
        }}
        onOpenActions={(el) => onOpenActions(ctx, el.getBoundingClientRect())}
      />
    </div>
  );
});
