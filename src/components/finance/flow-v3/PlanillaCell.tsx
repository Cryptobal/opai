"use client";

import { useCallback, type CSSProperties } from "react";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, NUM_CLASS, numSizeClass, type NumberFormatMode } from "./format";
import {
  CELL_BASE, COL_W, COMMITTED_DRAFT_CELL, COMMITTED_DTE_CELL,
  COMMITTED_PROFORMA_CELL, COMMITTED_SCHEDULED_CELL, CORNER_DTE, CORNER_PLAN,
  CORNER_REAL, CORNER_WARN, displayValue, REAL_CELL, ROW_H, TODAY_COL,
} from "./grid-classes";
import {
  committedPriority, cornerKind, dteCountInCell, pastPendingDteMeta,
  primaryCellTag, toneClass,
} from "./cell-meta";
import type { CellStyle } from "./usePlanillaViewPrefs";
import { InlineCellEditor } from "./InlineCellEditor";
import { useLongPress } from "./useLongPress";

interface Props {
  cell: FlowMatrixCellDto;
  section: string;
  /** Ancla para reabrir el popover con teclado: "rowId:colIdx". */
  dataRc: string;
  isCurrentCol: boolean;
  /** Semana < currentWeek: pendientes F° se muestran atenuadas sin sumar. */
  isPast?: boolean;
  editable: boolean;
  /** Clases de selección/rango (planilla-selected | planilla-range*). */
  rangeClass: string;
  editingInitial: string | null;
  /** shift=true extiende el rango desde el ancla; meta=Ctrl/Cmd para Σ. */
  onSelect: (extend: boolean, meta?: boolean) => void;
  onStartEdit: () => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
  onOpenPopover: (anchor: DOMRect) => void;
  /** Registra esta celda como objetivo del menú contextual del grid. */
  onContextTarget: () => void;
  /** Long-press táctil → action sheet (móvil). */
  onOpenCellSheet?: () => void;
  /** Modo Σ activo: tap togglea la celda en el set discontinuo. */
  sumMode?: boolean;
  /** Está en el set Σ. */
  inDiscreteSel?: boolean;
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
  /** Caption opcional bajo el monto (ej. "UF 24,5"). */
  caption?: string | null;
}

const ALIGN_H_CSS: Record<string, CSSProperties["textAlign"]> = {
  left: "left",
  center: "center",
  right: "right",
};
const ALIGN_V_CSS: Record<string, CSSProperties["verticalAlign"]> = {
  top: "top",
  middle: "middle",
  bottom: "bottom",
};
/** Con chips ON (flex-col): items = eje H, justify = eje V. */
const CHIP_ITEMS_H: Record<string, string> = {
  left: "items-start",
  center: "items-center",
  right: "items-end",
};
const CHIP_JUSTIFY_V: Record<string, string> = {
  top: "justify-start",
  middle: "justify-center",
  bottom: "justify-end",
};

export function PlanillaCell(p: Props) {
  const { cell } = p;
  const isEditing = p.editingInitial != null;
  const isPast = p.isPast === true;
  const mode = p.numberFormat ?? "clp";
  const value = displayValue(p.section, cell.layer, cell.effective);
  const formatted = value !== 0 ? fmtCell(value, mode) : "";
  const showChips = p.showChips === true;
  const pastPend = pastPendingDteMeta(cell, isPast);
  /** Pasado sin real: mostrar monto pendiente atenuado (no suma a effective). */
  const pastPendOnly = !!pastPend && cell.layer === "empty";
  const pastPendFormatted =
    pastPendOnly && pastPend.total !== 0 ? fmtCell(pastPend.total, mode) : "";

  const { hasDte, hasSentDoc, hasDraft } = committedPriority(cell);
  const committedClass = hasDte
    ? COMMITTED_DTE_CELL
    : hasSentDoc
      ? COMMITTED_PROFORMA_CELL
      : hasDraft
        ? COMMITTED_DRAFT_CELL
        : COMMITTED_SCHEDULED_CELL;

  const tag = primaryCellTag(cell, { isPast });
  const multiDteN = dteCountInCell(cell);
  const corner = showChips ? null : cornerKind(cell);
  const cornerClass =
    corner === "real"
      ? CORNER_REAL
      : corner === "dte"
        ? CORNER_DTE
        : corner === "warn"
          ? CORNER_WARN
          : corner === "plan"
            ? CORNER_PLAN
            : "";

  const layerClass = showChips
    ? cell.layer === "real"
      ? REAL_CELL
      : cell.layer === "committed"
        ? committedClass
        : pastPendOnly
          ? `${COMMITTED_DTE_CELL} opacity-60`
          : ""
    : pastPendOnly
      ? "opacity-60"
      : "";

  const textClass =
    pastPendOnly
      ? "text-ds-text-3"
      : cell.layer === "real" || cell.layer === "committed"
        ? "text-ds-text-1"
        : cell.layer === "plan"
          ? "text-ds-text-2"
          : "text-ds-text-4";
  const projAttenuate =
    !showChips && cell.layer === "committed" && corner === null ? "text-ds-text-3" : "";

  const displayFormatted = pastPendOnly ? pastPendFormatted : formatted;
  const longValue = displayFormatted ? numSizeClass(displayFormatted) : "";
  const cursorClass = p.draggable ? "cursor-grab" : p.editable ? "cursor-cell" : "cursor-default";
  const dragBlocked = !!p.dragBlockedTitle;

  const style = p.cellStyle;
  const styleInline: CSSProperties = {};
  if (style?.fill) styleInline.backgroundColor = style.fill;
  if (style?.color) styleInline.color = style.color;
  if (style?.align) styleInline.textAlign = ALIGN_H_CSS[style.align];
  if (style?.valign) {
    styleInline.verticalAlign = ALIGN_V_CSS[style.valign];
    if (style.valign === "top") styleInline.paddingTop = "1px";
    if (style.valign === "bottom") styleInline.paddingBottom = "1px";
  }
  const styleClass = style?.bold ? "font-semibold" : "";

  const chipItemsH = CHIP_ITEMS_H[style?.align ?? "right"] ?? "items-end";
  const chipJustifyV = CHIP_JUSTIFY_V[style?.valign ?? "middle"] ?? "justify-center";

  const titleParts: string[] = [];
  if (tag?.title) titleParts.push(tag.title);
  if (pastPend && cell.layer === "real") titleParts.push(pastPend.title);
  if (p.dragBlockedTitle) titleParts.push(p.dragBlockedTitle);
  if (mode !== "clp" && (pastPendOnly ? pastPend!.total : value) !== 0) {
    titleParts.push(
      `Exacto: ${fmtCell(pastPendOnly ? pastPend!.total : value, "clp")}`,
    );
  }
  if (p.caption) titleParts.push(p.caption);

  const openSheet = p.onOpenCellSheet;
  const handleLongPress = useCallback(() => {
    openSheet?.();
  }, [openSheet]);

  const lp = useLongPress(handleLongPress, { disabled: !openSheet || isEditing });

  return (
    <td
      data-rc={p.dataRc}
      className={[
        CELL_BASE, COL_W, ROW_H, NUM_CLASS, longValue, layerClass,
        projAttenuate || textClass, cornerClass,
        p.isCurrentCol ? TODAY_COL : "",
        p.rangeClass,
        cursorClass, styleClass,
        p.isDropTarget ? "outline outline-2 -outline-offset-2 outline-primary/70" : "",
        dragBlocked ? "[cursor:not-allowed]" : "",
        p.inDiscreteSel ? "ring-2 ring-inset ring-primary/60 bg-primary/10" : "",
        p.sumMode ? "cursor-pointer" : "",
      ].join(" ")}
      style={Object.keys(styleInline).length ? styleInline : undefined}
      title={titleParts.join(" · ") || undefined}
      draggable={p.draggable && !p.sumMode}
      onDragStart={p.draggable && !p.sumMode ? p.onDragStartCell : undefined}
      onDragOver={p.onDragOverCell}
      onDrop={p.onDropCell}
      onDragEnd={p.onDragEndCell}
      onContextMenu={p.onContextTarget}
      onPointerDown={lp.onPointerDown}
      onPointerMove={lp.onPointerMove}
      onPointerUp={lp.onPointerUp}
      onPointerCancel={lp.onPointerCancel}
      onClick={(e) => {
        if (lp.didFire()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (p.sumMode) {
          p.onSelect(false, true);
          return;
        }
        p.onSelect(e.shiftKey, e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={() => {
        if (p.sumMode) return;
        p.editable && p.onStartEdit();
      }}
    >
      {isEditing ? (
        <InlineCellEditor
          initial={p.editingInitial!}
          onCommit={p.onCommit}
          onCancel={p.onCancel}
        />
      ) : showChips && tag && (
        cell.layer === "committed" || cell.layer === "plan" || pastPendOnly
      ) ? (
        <span
          className={`pointer-events-none absolute inset-0 flex flex-col gap-px px-1.5 max-md:px-[3px] leading-none ${chipItemsH} ${chipJustifyV}`}
        >
          <span
            className={`max-w-full truncate font-sans text-[length:inherit] leading-[10px] ${toneClass(tag.tone)}`}
            title={tag.title}
          >
            {tag.tag}
          </span>
          {displayFormatted && (
            <span className={`max-w-full truncate leading-[10px] ${pastPendOnly ? "text-ds-text-3" : ""}`}>
              {displayFormatted}
            </span>
          )}
          {p.caption && (
            <span className="max-w-full truncate text-[12px] leading-tight text-ds-text-4">
              {p.caption}
            </span>
          )}
        </span>
      ) : (
        <>
          {displayFormatted}
          {p.caption && displayFormatted && (
            <span className="ml-0.5 text-[12px] text-ds-text-4">{p.caption}</span>
          )}
          {/* Real + F° pendiente en semana pasada: badge mixto. */}
          {pastPend && cell.layer === "real" && (
            <span
              className="ml-0.5 text-[12px] font-medium text-status-info-fg opacity-70"
              title={pastPend.title}
            >
              +F° pend.
            </span>
          )}
          {!showChips && !pastPendOnly && multiDteN >= 2 && (
            <span
              className="ml-0.5 text-[12px] font-medium text-status-info-fg"
              title={tag?.title}
            >
              ×{multiDteN}
            </span>
          )}
          {!showChips && pastPendOnly && pastPend.count >= 2 && (
            <span
              className="ml-0.5 text-[12px] font-medium text-status-info-fg opacity-70"
              title={pastPend.title}
            >
              ×{pastPend.count}
            </span>
          )}
        </>
      )}
    </td>
  );
}
