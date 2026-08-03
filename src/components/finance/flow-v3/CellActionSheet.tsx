"use client";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, fmtShortDate } from "./format";
import { displayValue } from "./grid-classes";
import { primaryCellTag } from "./cell-meta";
import { MenuItems, type MenuItemDesc } from "./menu-render";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: FlowMatrixRowDto | null;
  cell: FlowMatrixCellDto | null;
  weekLabel?: string;
  items: MenuItemDesc[];
  /** Contenido extra bajo el cell-card (ej. lista DTEs de Otros clientes). */
  children?: React.ReactNode;
}

const BORDER_BY_LAYER: Record<string, string> = {
  real: "border-l-status-ok-border",
  committed: "border-l-status-info-border",
  plan: "border-l-status-warn-border",
  empty: "border-l-ds-border-default",
};

/** Bottom-sheet móvil: cell-card + MenuItems (misma lógica que context menu). */
export function CellActionSheet({
  open, onOpenChange, row, cell, weekLabel, items, children,
}: Props) {
  const value = row && cell
    ? displayValue(row.section, cell.layer, cell.effective)
    : 0;
  const tag = cell ? primaryCellTag(cell) : null;
  const border = BORDER_BY_LAYER[cell?.layer ?? "empty"] ?? BORDER_BY_LAYER.empty;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-2xl p-0 max-h-[85vh] overflow-y-auto"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-border-default" aria-hidden />
        <SheetHeader className="px-5 pt-4 pb-3 text-left">
          <SheetTitle className="text-base text-ds-text-1">
            {row?.name ?? "Celda"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Acciones de la celda
          </SheetDescription>
          {cell && row && (
            <div
              className={`mt-2 rounded-lg border border-ds-border-subtle border-l-4 bg-ds-surface-2 px-3 py-2 ${border}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-ds-text-3">
                  {weekLabel ?? (cell.weekStart ? fmtShortDate(cell.weekStart) : "")}
                </span>
                {tag && (
                  <span className="text-[12px] font-medium text-ds-text-2">{tag.tag}</span>
                )}
              </div>
              <div className="mt-0.5 text-right font-display text-lg tabular-nums text-ds-text-1">
                {value !== 0 ? fmtCell(value, "clp") : "—"}
              </div>
            </div>
          )}
        </SheetHeader>
        {children}
        <div className="border-t border-ds-border-subtle">
          <MenuItems
            items={items}
            variant="sheet"
            onSheetClose={() => onOpenChange(false)}
          />
        </div>
        <div className="border-t border-ds-border-subtle p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 w-full rounded-ds-md bg-ds-surface-2 text-[14px] font-medium text-ds-text-1 active:bg-ds-surface-3"
          >
            Cancelar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
