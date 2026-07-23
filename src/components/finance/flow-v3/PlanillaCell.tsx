"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, formatThousands, NUM_CLASS, numSizeClass, parseSignedAmount } from "./format";
import {
  CELL_BASE, COL_W, COMMITTED_CELL, displayValue, REAL_CELL, ROW_H, SELECTED_CELL, TODAY_COL,
} from "./grid-classes";

interface Props {
  cell: FlowMatrixCellDto;
  section: string;
  /** Ancla para reabrir el popover con teclado: "rowId:colIdx". */
  dataRc: string;
  isCurrentCol: boolean;
  editable: boolean;
  selected: boolean;
  editingInitial: string | null;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
  onOpenPopover: (anchor: DOMRect) => void;
}

function EditInput({ initial, onCommit, onCancel }: {
  initial: string;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(value.length, value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const format = (raw: string) => {
    const neg = raw.trim().startsWith("-") ? "-" : "";
    return neg + formatThousands(raw);
  };
  return (
    <input
      ref={ref}
      value={value}
      inputMode="numeric"
      onChange={(e) => setValue(format(e.target.value))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); onCommit(value, "down"); }
        else if (e.key === "Tab") { e.preventDefault(); onCommit(value, "right"); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => onCommit(value, "none")}
      // max-md:h-7: el CSS global móvil fuerza font-size 16px en inputs
      // (anti-zoom iOS); a la altura de fila densa (~13px) el texto quedaría
      // recortado. La fila crece mientras se edita (como en Sheets).
      className={`h-[calc(var(--plnx-row-h)-2px)] max-md:h-7 w-full rounded-none border border-primary bg-ds-surface-2 px-1 max-md:px-0.5 text-right text-ds-text-1 outline-none ${NUM_CLASS}`}
    />
  );
}

export function PlanillaCell(p: Props) {
  const { cell } = p;
  const isEditing = p.editingInitial != null;
  const value = displayValue(p.section, cell.layer, cell.effective);
  const committedChip =
    cell.committed && cell.committed.items.length > 0
      ? (cell.committed.items.find((i) => i.folio)?.folio?.toString() ?? "P")
      : null;

  const layerClass =
    cell.layer === "real" ? REAL_CELL : cell.layer === "committed" ? COMMITTED_CELL : "";
  const textClass =
    cell.layer === "real"
      ? "text-ds-text-1"
      : cell.layer === "committed"
        ? "text-status-info-fg"
        : cell.layer === "plan"
          ? "text-ds-text-2"
          : "text-ds-text-4";

  const longValue = value !== 0 ? numSizeClass(fmtCell(value)) : "";

  return (
    <td
      data-rc={p.dataRc}
      className={[
        CELL_BASE, COL_W, ROW_H, NUM_CLASS, longValue, layerClass, textClass,
        p.isCurrentCol ? TODAY_COL : "",
        p.selected ? SELECTED_CELL : "",
        p.editable ? "cursor-cell" : "cursor-default",
      ].join(" ")}
      onClick={(e) => {
        p.onSelect();
        if (cell.committed || cell.real || cell.plan !== 0) {
          p.onOpenPopover((e.currentTarget as HTMLElement).getBoundingClientRect());
        }
      }}
      onDoubleClick={() => p.editable && p.onStartEdit()}
    >
      {isEditing ? (
        <EditInput initial={p.editingInitial!} onCommit={p.onCommit} onCancel={p.onCancel} />
      ) : (
        <>
          {committedChip && cell.layer === "committed" && (
            <span className="absolute right-0.5 top-0 font-mono text-[8px] leading-none text-status-info-fg/80">
              {committedChip}
            </span>
          )}
          {value !== 0 ? fmtCell(value) : ""}
        </>
      )}
    </td>
  );
}
