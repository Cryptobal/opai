"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import {
  fmtCell, formatThousands, NUM_CLASS, numSizeClass, type NumberFormatMode,
} from "./format";
import {
  CELL_BASE, COL_W, COMMITTED_DRAFT_CELL, COMMITTED_DTE_CELL,
  COMMITTED_PROFORMA_CELL, COMMITTED_SCHEDULED_CELL, CORNER_DTE, CORNER_REAL,
  CORNER_WARN, displayValue, REAL_CELL, ROW_H, SELECTED_CELL, TODAY_COL,
} from "./grid-classes";
import { committedPriority, cornerKind, primaryCellTag, toneClass } from "./cell-meta";
import type { CellStyle } from "./usePlanillaViewPrefs";

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
  showChips?: boolean;
  numberFormat?: NumberFormatMode;
  cellStyle?: CellStyle;
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
      className={`h-[calc(var(--plnx-row-h)-2px)] max-md:h-7 w-full rounded-none border border-primary bg-ds-surface-2 px-1 max-md:px-0.5 text-right text-ds-text-1 outline-none ${NUM_CLASS}`}
    />
  );
}

const ALIGN_H: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
const ALIGN_V: Record<string, string> = {
  top: "align-top",
  middle: "align-middle",
  bottom: "align-bottom",
};

export function PlanillaCell(p: Props) {
  const { cell } = p;
  const isEditing = p.editingInitial != null;
  const mode = p.numberFormat ?? "clp";
  const value = displayValue(p.section, cell.layer, cell.effective);
  const formatted = value !== 0 ? fmtCell(value, mode) : "";
  const showChips = p.showChips === true;

  const { hasDte, hasProforma, hasDraft } = committedPriority(cell);
  const committedClass = hasDte
    ? COMMITTED_DTE_CELL
    : hasProforma
      ? COMMITTED_PROFORMA_CELL
      : hasDraft
        ? COMMITTED_DRAFT_CELL
        : COMMITTED_SCHEDULED_CELL;

  const tag = primaryCellTag(cell);
  const corner = showChips ? null : cornerKind(cell);
  const cornerClass =
    corner === "real" ? CORNER_REAL : corner === "dte" ? CORNER_DTE : corner === "warn" ? CORNER_WARN : "";

  // Con chips OFF no tintamos el fondo (la marca de esquina basta); con chips
  // ON se conserva el sistema §5F de fondos/bordes.
  const layerClass = showChips
    ? cell.layer === "real"
      ? REAL_CELL
      : cell.layer === "committed"
        ? committedClass
        : ""
    : "";

  const textClass =
    cell.layer === "real" || cell.layer === "committed"
      ? "text-ds-text-1"
      : cell.layer === "plan"
        ? "text-ds-text-2"
        : "text-ds-text-4";
  // Proyección P (committed sin marca): monto atenuado.
  const projAttenuate =
    !showChips && cell.layer === "committed" && corner === null ? "text-ds-text-3" : "";

  const longValue = formatted ? numSizeClass(formatted) : "";
  const cursorClass = p.draggable ? "cursor-grab" : p.editable ? "cursor-cell" : "cursor-default";
  const dragBlocked = !!p.dragBlockedTitle;

  const style = p.cellStyle;
  const styleInline: CSSProperties = {};
  if (style?.fill) styleInline.backgroundColor = style.fill;
  if (style?.color) styleInline.color = style.color;
  const styleClass = [
    style?.bold ? "font-semibold" : "",
    style?.align ? ALIGN_H[style.align] : "",
    style?.valign ? ALIGN_V[style.valign] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const titleParts: string[] = [];
  if (tag?.title) titleParts.push(tag.title);
  if (p.dragBlockedTitle) titleParts.push(p.dragBlockedTitle);
  if (mode !== "clp" && value !== 0) titleParts.push(`Exacto: ${fmtCell(value, "clp")}`);

  return (
    <td
      data-rc={p.dataRc}
      className={[
        CELL_BASE, COL_W, ROW_H, NUM_CLASS, longValue, layerClass,
        projAttenuate || textClass, cornerClass,
        p.isCurrentCol ? TODAY_COL : "",
        p.selected ? SELECTED_CELL : "",
        cursorClass, styleClass,
        p.isDropTarget ? "outline outline-2 -outline-offset-2 outline-primary/70" : "",
        dragBlocked ? "[cursor:not-allowed]" : "",
      ].join(" ")}
      style={Object.keys(styleInline).length ? styleInline : undefined}
      title={titleParts.join(" · ") || undefined}
      draggable={p.draggable}
      onDragStart={p.draggable ? p.onDragStartCell : undefined}
      onDragOver={p.onDragOverCell}
      onDrop={p.onDropCell}
      onDragEnd={p.onDragEndCell}
      onContextMenu={p.onContextTarget}
      onClick={() => {
        // Clic = solo selección. Capas: Espacio / "Ver capas" / menú contextual.
        p.onSelect();
      }}
      onDoubleClick={() => p.editable && p.onStartEdit()}
    >
      {isEditing ? (
        <EditInput initial={p.editingInitial!} onCommit={p.onCommit} onCancel={p.onCancel} />
      ) : showChips && tag && cell.layer === "committed" ? (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-end justify-center gap-px px-1.5 max-md:px-[3px] leading-none">
          <span
            className={`max-w-full truncate font-sans text-[length:inherit] leading-[10px] ${toneClass(tag.tone)}`}
            title={tag.title}
          >
            {tag.tag}
          </span>
          {formatted && (
            <span className="max-w-full truncate leading-[10px]">{formatted}</span>
          )}
        </span>
      ) : (
        formatted
      )}
    </td>
  );
}
