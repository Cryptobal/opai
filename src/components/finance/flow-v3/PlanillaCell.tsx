"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, folioChip, formatThousands, NUM_CLASS, numSizeClass } from "./format";
import {
  CELL_BASE, CELL_CHIP_CLASS, COL_W, COMMITTED_DRAFT_CELL, COMMITTED_DTE_CELL,
  COMMITTED_PROFORMA_CELL, COMMITTED_SCHEDULED_CELL, displayValue, REAL_CELL, ROW_H,
  SELECTED_CELL, TODAY_COL,
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
  /** Registra esta celda como objetivo del menú contextual del grid. */
  onContextTarget: () => void;
  /** Drag de plan (desktop): la celda es arrastrable (capa plan editable con monto). */
  draggable: boolean;
  onDragStartCell: () => void;
  onDragOverCell: (e: React.DragEvent) => void;
  onDropCell: () => void;
  onDragEndCell: () => void;
  isDropTarget: boolean;
  /** Título (not-allowed) para celdas comprometido/real cuando el drag está activo. */
  dragBlockedTitle?: string;
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

  // Sub-capa del comprometido, por prioridad: factura emitida (azul relleno) >
  // proforma/EP enviado (ámbar relleno) > borrador (ámbar punteado) > cuota
  // programada (azul punteado). El chip resume: F°folio · EP · B · P.
  const cItems = cell.committed?.items ?? [];
  const hasDte = cItems.some((i) => i.kind === "dte");
  const hasProforma = cItems.some((i) => i.kind === "draft" && i.proformaSent);
  const hasDraft = cItems.some((i) => i.kind === "draft" && !i.proformaSent);
  const committedClass = hasDte
    ? COMMITTED_DTE_CELL
    : hasProforma
      ? COMMITTED_PROFORMA_CELL
      : hasDraft
        ? COMMITTED_DRAFT_CELL
        : COMMITTED_SCHEDULED_CELL;
  // Chip: el folio va en su propio color (status-info-fg) para leerse; el resto
  // (EP · B · P) en ds-text-3 para no competir con el número de la celda (§5F).
  const dteFolio = hasDte ? cItems.find((i) => i.folio)?.folio : undefined;
  const chip: { text: string; title?: string; tone: string } | null =
    cItems.length === 0
      ? null
      : hasDte
        ? {
            ...(dteFolio != null ? folioChip(dteFolio) : { text: "F°", title: "Factura emitida" }),
            tone: "text-status-info-fg",
          }
        : hasProforma
          ? { text: "EP", tone: "text-ds-text-3" }
          : hasDraft
            ? { text: "B", tone: "text-ds-text-3" }
            : { text: "P", tone: "text-ds-text-3" };
  const committedWarnTone = !hasDte && (hasProforma || hasDraft);

  const layerClass =
    cell.layer === "real" ? REAL_CELL : cell.layer === "committed" ? committedClass : "";
  const textClass =
    cell.layer === "real"
      ? "text-ds-text-1"
      : cell.layer === "committed"
        ? committedWarnTone
          ? "text-status-warn-fg"
          : "text-status-info-fg"
        : cell.layer === "plan"
          ? "text-ds-text-2"
          : "text-ds-text-4";

  const longValue = value !== 0 ? numSizeClass(fmtCell(value)) : "";

  const cursorClass = p.draggable ? "cursor-grab" : p.editable ? "cursor-cell" : "cursor-default";
  const dragBlocked = !!p.dragBlockedTitle;

  return (
    <td
      data-rc={p.dataRc}
      className={[
        CELL_BASE, COL_W, ROW_H, NUM_CLASS, longValue, layerClass, textClass,
        p.isCurrentCol ? TODAY_COL : "",
        p.selected ? SELECTED_CELL : "",
        cursorClass,
        p.isDropTarget ? "outline outline-2 -outline-offset-2 outline-primary/70" : "",
        dragBlocked ? "[cursor:not-allowed]" : "",
      ].join(" ")}
      title={p.dragBlockedTitle}
      draggable={p.draggable}
      onDragStart={p.draggable ? p.onDragStartCell : undefined}
      onDragOver={p.onDragOverCell}
      onDrop={p.onDropCell}
      onDragEnd={p.onDragEndCell}
      onContextMenu={p.onContextTarget}
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
          {chip && cell.layer === "committed" && (
            <span className={`${CELL_CHIP_CLASS} ${chip.tone}`} title={chip.title}>
              {chip.text}
            </span>
          )}
          {value !== 0 ? fmtCell(value) : ""}
        </>
      )}
    </td>
  );
}
