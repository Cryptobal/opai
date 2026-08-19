"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetTitle,
} from "@/components/ui/sheet";
import { useIsTouchLayout } from "@/hooks/useIsTouchLayout";
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
  /** Si true, enfoca el editor de nota (sigue en Composición). */
  focusNote?: boolean;
  excludedForRow?: FlowExcludedDte[];
  onViewDte?: (dteId: string) => void;
  onExcludeDte?: (dteId: string, reason: string) => Promise<void>;
  onRestoreDte?: (dteId: string) => Promise<void>;
  onSaveNote?: (
    rowId: string,
    weekStart: string,
    body: string | null,
    opts?: { applyToFuturePlanCells?: boolean },
  ) => Promise<boolean>;
  onSettleClosed?: () => void;
  onSettleReopen?: () => void;
  onMatchPlanToReal?: () => void;
  onMoveResidual?: () => void;
  moveWeeks?: MatrixColumn[];
  onMoveDte?: (dteId: string, targetWeek: string) => void;
  onMoveScheduled?: (templateId: string, billingPeriod: string, targetWeek: string) => void;
  onMoveMilestone?: (milestoneKey: string, billingPeriod: string, targetWeek: string) => void;
  /** Acciones del menú de celda (sin duplicar Composición/Historial). */
  actions?: MenuItemDesc[];
}

/**
 * Panel único de celda: Composición (con nota inline) · Historial + acciones.
 * Desktop: popover anclado. Táctil: bottom sheet con scroll y safe-area.
 */
export function CellLayersPopover({
  state, onClose, canManage, editable, editReason, focusNote, excludedForRow,
  onViewDte, onExcludeDte, onRestoreDte, onSaveNote,
  onSettleClosed, onSettleReopen, onMatchPlanToReal, onMoveResidual,
  moveWeeks, onMoveDte, onMoveScheduled, onMoveMilestone, actions = [],
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<CellDetailTab>("composicion");
  const isTouch = useIsTouchLayout();

  useEffect(() => {
    if (!state) return;
    // Nota vive en Composición; focusNote solo enfoca el textarea.
    setTab("composicion");
  }, [state, focusNote]);

  useEffect(() => {
    if (!state || isTouch) return;
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
  }, [state, onClose, isTouch]);

  if (!state) return null;
  const { row, cell } = state;
  const ariaLabel = `Detalle de ${row.name} · semana ${cell.weekStart}`;

  const body: ReactNode = (
    <>
      <CellDetailTabs
        rowName={row.name}
        weekStart={cell.weekStart}
        layer={cell.layer}
        tab={tab}
        onTabChange={setTab}
      >
        {tab === "composicion" && (
          <>
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
            <div className="rounded border border-ds-border-subtle bg-ds-surface-2 px-2 py-1.5">
              <CellNoteEditor
                rowId={row.id}
                weekStart={cell.weekStart}
                initial={cell.note ?? ""}
                canManage={!!canManage && !!onSaveNote}
                save={onSaveNote ?? (async () => false)}
                autoFocus={!!focusNote}
                autoGrow
                compact
                rows={1}
                placeholder="Escribe una nota…"
              />
            </div>
          </>
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
            variant={isTouch ? "sheet" : "panel"}
            onSheetClose={onClose}
          />
        </div>
      )}
    </>
  );

  if (isTouch) {
    return (
      <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent
          side="bottom"
          surface="opaque"
          className="z-50 max-h-[85dvh] gap-0 overflow-y-auto overscroll-contain rounded-t-2xl px-3 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2 text-[13px]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ds-border-default" aria-hidden />
          <SheetTitle className="sr-only">{ariaLabel}</SheetTitle>
          <SheetDescription className="sr-only">
            Composición, historial y acciones de la celda
          </SheetDescription>
          <div className="space-y-1.5 pr-8">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const left = Math.max(8, Math.min(state.anchor.left, window.innerWidth - 348));
  const top = Math.min(state.anchor.bottom + 4, window.innerHeight - 340);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      className="fixed z-50 w-[340px] max-h-[min(72vh,640px)] space-y-1.5 overflow-y-auto overscroll-contain rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-[13px] shadow-lg"
      style={{ left, top }}
    >
      {body}
    </div>
  );
}
