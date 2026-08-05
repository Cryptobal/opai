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
  /** Cierra aunque esté anclada (Esc / selección nueva). */
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
 * Ficha de hover de instancia única. Estado local propio; API imperativa
 * para no re-renderizar el grid al mover el puntero.
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
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  pinnedRef.current = pinned;
  visibleRef.current = visible;

  const place = useCallback((rect: DOMRect) => {
    const w = 268;
    const estH = 220;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    // Sin hueco: solapa 2 px la celda para que el puntero no “caiga” en la de abajo.
    let top = rect.bottom - 2;
    if (top + estH > window.innerHeight - 8) top = Math.max(8, rect.top - estH + 2);
    setPos({ left, top });
  }, []);

  const hardHide = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setPinned(false);
    setEditingNote(false);
    setVisible(false);
    setCtx(null);
  }, []);

  useImperativeHandle(ref, () => ({
    show(next, rect) {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      setCtx(next);
      place(rect);
      setVisible(true);
      if (!pinnedRef.current) setEditingNote(false);
    },
    hide() {
      if (pinnedRef.current) return;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
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
      className="planilla-cell-hover fixed rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-[13px] shadow-lg"
      data-visible="true"
      role={editingNote ? "dialog" : "tooltip"}
      aria-label={editingNote ? `Nota · ${model.concept}` : `Detalle · ${model.concept}`}
      style={{ left: pos.left, top: pos.top }}
      onPointerEnter={() => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
      }}
      onPointerLeave={() => {
        if (pinnedRef.current) return;
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => {
          if (pinnedRef.current) return;
          setVisible(false);
          setEditingNote(false);
          setCtx(null);
        }, 180);
      }}
    >
      {/* Puente invisible hacia la celda fuente: evita el hueco que robaba el hover. */}
      <div
        aria-hidden
        className="pointer-events-auto absolute -top-3 left-0 right-0 h-3"
      />
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
          setEditingNote(false); setPinned(false); setVisible(false); setCtx(null);
        }}
        onNoteDone={() => { setEditingNote(false); setPinned(false); }}
        onOpenActions={(el) => onOpenActions(ctx, el.getBoundingClientRect())}
      />
    </div>
  );
});
