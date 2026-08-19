"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowExcludedDte } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto, MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { CellCompositionPanel } from "./CellCompositionPanel";
import { CellDetailTabs, type CellDetailTab } from "./CellDetailTabs";
import { CellHistoryList } from "./CellHistoryList";
import { CellNoteEditor } from "./CellNoteEditor";
import { MenuItems, type MenuItemDesc } from "./menu-render";

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
  moveWeeks?: MatrixColumn[];
  onMoveDte?: (dteId: string, targetWeek: string) => void;
  onMoveScheduled?: (templateId: string, billingPeriod: string, targetWeek: string) => void;
  onMoveMilestone?: (milestoneKey: string, billingPeriod: string, targetWeek: string) => void;
  /** Acciones del menú de celda (sin duplicar Composición/Nota/Historial). */
  actions?: MenuItemDesc[];
}

/**
 * Panel único de celda: Composición · Nota · Historial + acciones.
 */
export function CellLayersPopover({
  state, onClose, canManage, editable, editReason, focusNote, excludedForRow,
  onViewDte, onExcludeDte, onRestoreDte, onSaveNote,
  onSettleClosed, onSettleReopen, onMatchPlanToReal, onMoveResidual,
  moveWeeks, onMoveDte, onMoveScheduled, onMoveMilestone, actions = [],
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
      const t = e.target as Element | null;
      if (t && panelRef.current?.contains(t)) return;
      // Clic derecho en otra celda: el contextmenu del grid abre el panel nuevo.
      if (e.button === 2 && t?.closest?.("td[data-rc]")) return;
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
  const left = Math.max(8, Math.min(state.anchor.left, window.innerWidth - 348));
  const top = Math.min(state.anchor.bottom + 4, window.innerHeight - 340);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Detalle de ${row.name} · semana ${cell.weekStart}`}
      className="fixed z-50 w-[340px] max-h-[min(72vh,640px)] space-y-1.5 overflow-y-auto overscroll-contain rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-[13px] shadow-lg"
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
            moveWeeks={moveWeeks}
            onMoveDte={onMoveDte}
            onMoveScheduled={onMoveScheduled}
            onMoveMilestone={onMoveMilestone}
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
      {actions.length > 0 && (
        <div className="border-t border-ds-border-subtle pt-1.5">
          <p className="px-1.5 pb-0.5 text-[12px] font-medium text-ds-text-3">Acciones</p>
          <MenuItems
            key={`${row.id}:${cell.weekStart}`}
            items={actions}
            variant="panel"
            onSheetClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
