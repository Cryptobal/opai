"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowExcludedDte } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { CellCompositionPanel } from "./CellCompositionPanel";
import { CellDetailTabs, type CellDetailTab } from "./CellDetailTabs";
import { CellHistoryList } from "./CellHistoryList";
import { CellNoteEditor } from "./CellNoteEditor";

export interface PopoverState {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  anchor: { left: number; top: number; bottom: number };
}

interface Props {
  state: PopoverState | null;
  onClose: () => void;
  canManage?: boolean;
  editable?: boolean;
  editReason?: string;
  /** Si true, abre la pestaña Nota. */
  focusNote?: boolean;
  excludedForRow?: FlowExcludedDte[];
  onViewDte?: (dteId: string) => void;
  onExcludeDte?: (dteId: string, reason: string) => Promise<void>;
  onRestoreDte?: (dteId: string) => Promise<void>;
  onSaveNote?: (rowId: string, weekStart: string, body: string | null) => Promise<boolean>;
  onSettleClosed?: () => void;
  onSettleReopen?: () => void;
  onMatchPlanToReal?: () => void;
  onMoveResidual?: () => void;
}

/**
 * Panel de detalle de celda con pestañas Composición · Nota · Historial.
 */
export function CellLayersPopover({
  state, onClose, canManage, editable, editReason, focusNote, excludedForRow,
  onViewDte, onExcludeDte, onRestoreDte, onSaveNote,
  onSettleClosed, onSettleReopen, onMatchPlanToReal, onMoveResidual,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<CellDetailTab>("composicion");

  useEffect(() => {
    if (!state) return;
    setTab(focusNote ? "nota" : "composicion");
  }, [state, focusNote]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [state, onClose]);

  if (!state) return null;
  const { row, cell } = state;
  const left = Math.max(8, Math.min(state.anchor.left, window.innerWidth - 328));
  const top = Math.min(state.anchor.bottom + 4, window.innerHeight - 340);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Capas de ${row.name} · semana ${cell.weekStart}`}
      className="fixed z-50 w-[320px] space-y-1.5 rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-xs shadow-lg"
      style={{ left, top }}
    >
      <CellDetailTabs
        rowName={row.name}
        weekStart={cell.weekStart}
        layer={cell.layer}
        tab={tab}
        onTabChange={setTab}
      >
        {tab === "composicion" && (
          <CellCompositionPanel
            cell={cell}
            canManage={canManage}
            editable={editable}
            editReason={editReason}
            excluded={excludedForRow}
            onViewDte={onViewDte}
            onExcludeDte={onExcludeDte}
            onRestoreDte={onRestoreDte}
            onSettleClosed={onSettleClosed}
            onSettleReopen={onSettleReopen}
            onMatchPlanToReal={onMatchPlanToReal}
            onMoveResidual={onMoveResidual}
            onClose={onClose}
          />
        )}
        {tab === "nota" && (
          <CellNoteEditor
            rowId={row.id}
            weekStart={cell.weekStart}
            initial={cell.note ?? ""}
            canManage={!!canManage && !!onSaveNote}
            save={onSaveNote ?? (async () => false)}
            autoFocus={!!focusNote}
            rows={6}
          />
        )}
        {tab === "historial" && (
          <CellHistoryList rowId={row.id} weekStart={cell.weekStart} />
        )}
      </CellDetailTabs>
    </div>
  );
}
