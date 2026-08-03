"use client";

import type { ReactNode } from "react";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { columnLetter } from "./column-letter";
import { fmtClp, fmtDayMonth } from "./format";
import { committedItemMeta, primaryCellTag, toneClass } from "./cell-meta";
import { displayValue } from "./grid-classes";

export interface FxSelection {
  rowNumber: number;
  rowName: string;
  colIdx: number;
  weekStart: string;
  row?: FlowMatrixRowDto;
  cell?: FlowMatrixCellDto;
  /** Fila de totales del footer. */
  balanceKind?: "flow" | "balance";
  balanceValue?: number;
}

interface Props {
  selection: FxSelection | null;
  onOpenLayers: () => void;
}

/**
 * Barra fx (30px): name box (letra+fila) + composición de la celda.
 * Totales muestran fórmula descriptiva. "Ver capas" abre el popover.
 */
export function PlanillaFxBar({ selection, onOpenLayers }: Props) {
  const ref =
    selection != null
      ? `${columnLetter(selection.colIdx + 1)}${selection.rowNumber}`
      : "";

  let body: ReactNode = (
    <span className="text-ds-text-4">Selecciona una celda</span>
  );

  if (selection?.balanceKind === "flow") {
    body = (
      <span className="truncate">
        <span className="font-medium text-ds-text-1">FLUJO SEMANA</span>
        <span className="text-ds-text-3"> · S · {fmtDayMonth(selection.weekStart)} · </span>
        <span className="tabular-nums text-ds-text-1">{fmtClp(selection.balanceValue ?? 0)}</span>
        <span className="text-ds-text-3"> · = ingresos − egresos</span>
      </span>
    );
  } else if (selection?.balanceKind === "balance") {
    body = (
      <span className="truncate">
        <span className="font-medium text-ds-text-1">SALDO</span>
        <span className="text-ds-text-3"> · {fmtDayMonth(selection.weekStart)} · </span>
        <span className="tabular-nums text-ds-text-1">{fmtClp(selection.balanceValue ?? 0)}</span>
        <span className="text-ds-text-3"> · = saldo anterior + flujo semana</span>
      </span>
    );
  } else if (selection?.cell && selection.row) {
    const { cell, row } = selection;
    const tag = primaryCellTag(cell);
    const value = displayValue(row.section, cell.layer, cell.effective);
    const items = cell.committed?.items ?? [];
    body = (
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <span className="truncate font-medium text-ds-text-1">{selection.rowName}</span>
        <span className="shrink-0 text-ds-text-4">·</span>
        <span className="shrink-0 text-ds-text-3">{fmtDayMonth(selection.weekStart)}</span>
        {tag && (
          <>
            <span className="shrink-0 text-ds-text-4">·</span>
            <span className={`shrink-0 font-medium ${toneClass(tag.tone)}`}>{tag.tag}</span>
          </>
        )}
        {value !== 0 && (
          <>
            <span className="shrink-0 text-ds-text-4">·</span>
            <span className="shrink-0 tabular-nums text-ds-text-1">{fmtClp(value)}</span>
          </>
        )}
        {items.length > 0 && (
          <span className="truncate text-ds-text-3">
            — {items.map((it) => committedItemMeta(it).title).join(", ")}
            {items[0]?.label ? `: ${items[0].label}` : ""}
          </span>
        )}
        {cell.layer === "real" && cell.real?.items[0] && (
          <span className="truncate text-ds-text-3">
            — {cell.real.items[0].label}
          </span>
        )}
        {cell.layer === "plan" && (
          <span className="truncate text-ds-text-3">— plan manual</span>
        )}
      </span>
    );
  } else if (selection) {
    body = (
      <span className="truncate">
        <span className="font-medium text-ds-text-1">{selection.rowName}</span>
        <span className="text-ds-text-3"> · {fmtDayMonth(selection.weekStart)}</span>
      </span>
    );
  }

  const canLayers = !!(selection?.cell && (selection.cell.committed || selection.cell.real || selection.cell.plan !== 0));

  return (
    <div
      className="planilla-chrome-print-hide hidden h-[var(--plnx-fxbar-h)] items-center gap-2 border-b border-ds-border-subtle bg-ds-surface-2 px-2 lg:flex"
      role="status"
      aria-label="Barra de fórmula"
    >
      <div
        className="flex h-6 w-14 shrink-0 items-center justify-center rounded border border-ds-border-default bg-ds-surface-1 text-[12px] font-medium tabular-nums text-ds-text-2"
        title="Referencia de celda"
      >
        {ref || "—"}
      </div>
      <div className="flex h-6 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded border border-ds-border-default bg-ds-surface-1 px-2 text-[12px]">
        <span className="shrink-0 text-ds-text-4" aria-hidden>ƒx</span>
        {body}
      </div>
      <button
        type="button"
        disabled={!canLayers}
        onClick={onOpenLayers}
        className="h-6 shrink-0 rounded border border-ds-border-default px-2 text-[12px] text-ds-text-2 hover:bg-ds-surface-3 disabled:opacity-40"
      >
        Ver capas
      </button>
    </div>
  );
}
