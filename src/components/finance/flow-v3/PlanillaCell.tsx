"use client";

import { useCallback, type CSSProperties } from "react";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtCell, NUM_CLASS, numSizeClass, type NumberFormatMode } from "./format";
import { ChevronDown } from "lucide-react";
import {
  CELL_BASE, CELL_CARET, COL_W, COMMITTED_CEDED_CELL, COMMITTED_DRAFT_CELL,
  COMMITTED_DTE_CELL, COMMITTED_SCHEDULED_CELL, CORNER_DTE, CORNER_PLAN,
  CORNER_REAL, CORNER_WARN, NOTE_DOT_EL, OVERDUE_CELL, OVERDUE_OVER60_CELL,
  SUB_CORNER_CEDED, SUB_CORNER_EP,
  SUB_CORNER_PROFORMA, displayValue, REAL_CELL, ROW_H, TODAY_COL,
} from "./grid-classes";
import {
  cellCededState, cellOverdueState, committedChipFillKey, committedPriority,
  cornerKind, countOverdueInCell, dteCountInCell, executionMeta,
  pastPendingGhostMeta, primaryCellTag, secondaryMarkTitle, secondaryMarks,
  toneClass, type SecondaryMark,
} from "./cell-meta";
import { DraftSentIcons } from "./DraftSentIcons";
import { ExecutionBar } from "./ExecutionBar";
import { noteCellPreview } from "@/modules/finance/flow-v3/cell-note-preview";

const SUB_CORNER_CLASS: Record<SecondaryMark, string> = {
  ceded: SUB_CORNER_CEDED,
  proforma: SUB_CORNER_PROFORMA,
  estadoPago: SUB_CORNER_EP,
};

const CHIP_FILL: Record<
  ReturnType<typeof committedChipFillKey>,
  string
> = {
  ceded: COMMITTED_CEDED_CELL,
  dte: COMMITTED_DTE_CELL,
  draft: COMMITTED_DRAFT_CELL,
  scheduled: COMMITTED_SCHEDULED_CELL,
};
import type { CellStyle } from "./usePlanillaViewPrefs";
import { InlineCellEditor } from "./InlineCellEditor";
import { useLongPress } from "./useLongPress";
import type { CellDragPayload, StackedLine } from "./cell-drag";

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
  /** Resalte cruzado de fila (celda única activa). */
  crossHighlightRow?: boolean;
  /** Resalte cruzado de columna (celda única activa). */
  crossHighlightCol?: boolean;
  editingInitial: string | null;
  /** shift=true extiende el rango desde el ancla; meta=Ctrl/Cmd para Σ. */
  onSelect: (extend: boolean, meta?: boolean) => void;
  onStartEdit: () => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
  onOpenPopover: (anchor: DOMRect) => void;
  /** Clic derecho: selecciona (si hace falta) y abre el panel de detalle. */
  onContextTarget: (e: React.MouseEvent) => void;
  /** Long-press táctil → action sheet (móvil). */
  onOpenCellSheet?: () => void;
  /** Abre el editor de nota (indicador real). */
  onOpenNote?: () => void;
  /** Abre el menú de acciones vía chevron (solo celda seleccionada). */
  onOpenCaretMenu?: (anchor: DOMRect) => void;
  /** Ficha de hover activa: omite el title nativo del navegador. */
  hoverCards?: boolean;
  /** Modo Σ activo: tap togglea la celda en el set discontinuo. */
  sumMode?: boolean;
  /** Está en el set Σ. */
  inDiscreteSel?: boolean;
  /** Drag de plan o de un único F°/P (desktop). */
  draggable: boolean;
  onDragStartCell: () => void;
  onDragOverCell: (e: React.DragEvent) => void;
  onDropCell: () => void;
  onDragEndCell: () => void;
  isDropTarget: boolean;
  /** F° y P en la misma casilla: una línea por cobro, cada una arrastrable. */
  stackedLines?: StackedLine[];
  canDragItems?: boolean;
  onItemDragStart?: (payload: CellDragPayload) => void;
  /** Título (not-allowed) solo si el ítem no se puede arrastrar. */
  dragBlockedTitle?: string;
  showChips?: boolean;
  numberFormat?: NumberFormatMode;
  cellStyle?: CellStyle;
  /** Caption opcional bajo el monto (ej. "UF 24,5"). */
  caption?: string | null;
  /** Umbral |delta| para chip de desviación (default 100000). */
  driftAlertThresholdClp?: number;
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
  /** Default modo color (fondo+chip); solo cuñas si se pasa false. */
  const showChips = p.showChips !== false;
  const pastPend = pastPendingGhostMeta(cell, isPast);
  /** Pasado sin real: mostrar monto pendiente atenuado (no suma a effective). */
  const pastPendOnly = !!pastPend && cell.layer === "empty";
  const pastPendFormatted =
    pastPendOnly && pastPend.total !== 0 ? fmtCell(pastPend.total, mode) : "";
  /** Conciliado (real): negrilla semántica — el resto queda en peso normal. */
  const reconciledBold = cell.layer === "real" && !pastPendOnly;

  const { hasDte, hasSentDoc, hasDraft } = committedPriority(cell);
  const cededState = cellCededState(cell);
  const overdueState = cellOverdueState(cell);
  const overdueClass =
    overdueState === "overdue60"
      ? OVERDUE_OVER60_CELL
      : overdueState === "overdue"
        ? OVERDUE_CELL
        : "";
  /** Fondo solo en etapas fuertes; borrador (con/sin EP·proforma) queda gris. */
  const committedClass = CHIP_FILL[
    committedChipFillKey({
      hasDte,
      hasDraft,
      hasSentDoc,
      ceded: cededState !== "none",
    })
  ];

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
  const hasNote = !!cell.note?.trim();
  const notePreview = hasNote ? noteCellPreview(cell.note!) : "";
  const isSelected = p.rangeClass.includes("planilla-selected");
  const crossRow = !!p.crossHighlightRow && !isSelected;
  const crossCol = !!p.crossHighlightCol && !isSelected;
  const subMarks = secondaryMarks(cell);
  const subTitle = secondaryMarkTitle(subMarks);
  /** Modo chips: borrador siempre «B»; EP/proforma → iconos (no cuñas ni chip EP). */
  const isDraftChip =
    showChips &&
    cell.layer === "committed" &&
    !hasDte &&
    (hasDraft || hasSentDoc);
  const draftDocMarks = isDraftChip
    ? subMarks.filter((m): m is "proforma" | "estadoPago" =>
        m === "proforma" || m === "estadoPago",
      )
    : [];
  const chipTag = isDraftChip
    ? {
        tag: "B",
        tone: "warn" as const,
        title: subTitle ? `Borrador · ${subTitle}` : "Borrador",
      }
    : tag;
  const chipTagClass = showChips && hasDte && cededState !== "none"
    ? "text-tint-violet-fg"
    : chipTag
      ? toneClass(chipTag.tone)
      : "";

  const layerClass = showChips
    ? cell.layer === "real"
      ? REAL_CELL
      : cell.layer === "committed"
        ? `${committedClass} ${overdueClass}`.trim()
        : pastPendOnly
          ? `${
              // Pendiente pasado cedido: mismo violeta atenuado.
              (cell.committed?.items ?? []).some(
                (i) =>
                  i.kind === "dte" &&
                  ((i.cededPct ?? 0) > 0 || i.ceded === true),
              )
                ? COMMITTED_CEDED_CELL
                : COMMITTED_DTE_CELL
            } opacity-60`
          : ""
    : pastPendOnly
      ? "opacity-60"
      : overdueClass;
  /** Negativos (p.ej. financiamiento con egreso) en rojo para leer egresos de un vistazo. */
  const negativeClass = !pastPendOnly && value < 0 ? "text-status-danger-fg" : "";
  const textClass =
    pastPendOnly
      ? "text-ds-text-3"
      : negativeClass
        ? negativeClass
        : cell.layer === "real" || cell.layer === "committed"
          ? "text-ds-text-1"
          : cell.layer === "plan"
            ? "text-ds-text-2"
            : "text-ds-text-4";
  const projAttenuate =
    !showChips && cell.layer === "committed" && corner === null && value >= 0
      ? "text-ds-text-3"
      : "";

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
  const styleClass = style?.bold || reconciledBold ? "font-semibold" : "";

  const chipItemsH = CHIP_ITEMS_H[style?.align ?? "right"] ?? "items-end";
  const chipJustifyV = CHIP_JUSTIFY_V[style?.valign ?? "middle"] ?? "justify-center";

  const titleParts: string[] = [];
  if (tag?.title) titleParts.push(tag.title);
  if (subTitle) titleParts.push(subTitle);
  if (pastPend && cell.layer === "real") titleParts.push(pastPend.title);
  if (overdueState !== "none") {
    const n = countOverdueInCell(cell);
    titleParts.push(
      overdueState === "overdue60"
        ? `${n} factura${n === 1 ? "" : "s"} con mora +60 días`
        : `${n} factura${n === 1 ? "" : "s"} en mora`,
    );
  }
  if (cell.note?.trim()) titleParts.push(`Nota: ${cell.note.trim()}`);
  if (p.dragBlockedTitle) titleParts.push(p.dragBlockedTitle);
  if (mode !== "clp" && (pastPendOnly ? pastPend!.total : value) !== 0) {
    titleParts.push(
      `Exacto: ${fmtCell(pastPendOnly ? pastPend!.total : value, "clp")}`,
    );
  }
  if (p.caption) titleParts.push(p.caption);

  const exec = executionMeta(cell);
  if (exec?.title) titleParts.push(exec.title);

  const driftThreshold = p.driftAlertThresholdClp ?? 100_000;
  const showDriftChip =
    cell.drift != null && Math.abs(cell.drift.delta) >= driftThreshold;
  if (showDriftChip && cell.drift) {
    const pctLabel =
      exec?.pct != null
        ? ` · ${Math.round(exec.pct)}% ejecutado`
        : cell.drift.pct != null
          ? ` (${cell.drift.pct.toFixed(1)}%)`
          : "";
    titleParts.push(
      `Desviación ${cell.drift.delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(cell.drift.delta)).toLocaleString("es-CL")}${pctLabel}`,
    );
  }

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
        crossRow ? "plnx-sel-cross-row" : "",
        crossCol ? "plnx-sel-cross-col" : "",
        cursorClass, styleClass,
        p.isDropTarget ? "outline outline-2 -outline-offset-2 outline-primary/70" : "",
        dragBlocked ? "[cursor:not-allowed]" : "",
        p.inDiscreteSel ? "ring-2 ring-inset ring-primary/60 bg-primary/10" : "",
        p.sumMode ? "cursor-pointer" : "",
      ].join(" ")}
      style={Object.keys(styleInline).length ? styleInline : undefined}
      title={p.hoverCards ? undefined : (titleParts.join(" · ") || undefined)}
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
        if (p.editable) {
          p.onStartEdit();
          return;
        }
        // Touch / celdas no editables (p.ej. semana pasada): 2.º tap abre el sheet.
        openSheet?.();
      }}
    >
      {/* Cuñas secundarias solo en modo marcas; en chips van fondo/iconos. */}
      {!showChips && subMarks.length > 0 && (
        <span
          className="pointer-events-none absolute bottom-0 right-0 z-[1] flex flex-col-reverse items-end"
          aria-hidden
        >
          {subMarks.map((m) => (
            <span key={m} className={SUB_CORNER_CLASS[m]} />
          ))}
        </span>
      )}
      {hasNote && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Editar nota"
          className={NOTE_DOT_EL}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            p.onOpenNote?.();
          }}
        />
      )}
      {exec?.showBar && (
        <ExecutionBar
          pctWidth={exec.pctWidth}
          over={exec.state === "over"}
          hasNote={hasNote}
          title={exec.title}
        />
      )}
      {isSelected && !isEditing && p.onOpenCaretMenu && (
        <button
          type="button"
          aria-label="Acciones de celda"
          className={CELL_CARET}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            p.onOpenCaretMenu?.(rect);
          }}
        >
          <ChevronDown aria-hidden />
        </button>
      )}
      {isEditing ? (
        <InlineCellEditor
          initial={p.editingInitial!}
          onCommit={p.onCommit}
          onCancel={p.onCancel}
        />
      ) : showChips && (p.stackedLines?.length ?? 0) >= 2 && (
        cell.layer === "committed" || pastPendOnly
      ) ? (
        <span
          className={`absolute inset-0 flex flex-col justify-center gap-px px-1.5 max-md:px-[3px] leading-none ${chipItemsH}`}
        >
          {p.stackedLines!.map((line) => {
            const canDrag = !!p.canDragItems && !!line.drag && !p.sumMode;
            return (
              <span
                key={line.key}
                draggable={canDrag}
                title={line.title}
                className={`flex w-full max-w-full items-center justify-between gap-1 leading-[10px] ${
                  canDrag ? "cursor-grab" : ""
                }`}
                onDragStart={
                  canDrag
                    ? (e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", line.tag);
                        p.onItemDragStart?.(line.drag!);
                      }
                    : undefined
                }
              >
                <span className={`min-w-0 truncate font-sans ${toneClass(line.tone)}`}>
                  {line.tag}
                </span>
                <span className="shrink-0 tabular-nums">{fmtCell(line.monto, mode)}</span>
              </span>
            );
          })}
        </span>
      ) : showChips && chipTag && (
        cell.layer === "committed" || cell.layer === "plan" || pastPendOnly
      ) ? (
        <span
          className={`pointer-events-none absolute inset-0 flex flex-col gap-px px-1.5 max-md:px-[3px] leading-none ${chipItemsH} ${chipJustifyV}`}
        >
          <span
            className={`max-w-full truncate font-sans text-[length:inherit] leading-[10px] ${chipTagClass}`}
            title={chipTag.title}
          >
            {chipTag.tag}
          </span>
          {displayFormatted && (
            <span
              className={`inline-flex max-w-full items-center gap-0.5 leading-[10px] ${
                pastPendOnly ? "text-ds-text-3" : ""
              }`}
            >
              <span className="truncate">{displayFormatted}</span>
              {isDraftChip && <DraftSentIcons marks={draftDocMarks} />}
            </span>
          )}
          {p.caption && (
            <span className="max-w-full truncate text-[12px] leading-tight text-ds-text-4">
              {p.caption}
            </span>
          )}
          {!p.caption && notePreview && (
            <span
              className="max-w-full truncate text-[12px] leading-tight text-status-info-fg"
              title={cell.note!.trim()}
            >
              {notePreview}
            </span>
          )}
          {showDriftChip && cell.drift && (
            <span
              className={`text-[12px] font-medium leading-tight ${
                cell.drift.delta > 0 ? "text-status-ok-fg" : "text-status-danger-fg"
              }`}
            >
              {cell.drift.delta > 0 ? "▲" : "▼"}
              {exec?.pct != null ? ` ${Math.round(exec.pct)}%` : ""}
            </span>
          )}
        </span>
      ) : (
        <>
          {displayFormatted}
          {p.caption && displayFormatted && (
            <span className="ml-0.5 text-[12px] text-ds-text-4">{p.caption}</span>
          )}
          {!p.caption && notePreview && displayFormatted && (
            <span
              className="ml-0.5 max-w-[7rem] truncate text-[12px] text-status-info-fg"
              title={cell.note!.trim()}
            >
              {notePreview}
            </span>
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
          {showDriftChip && cell.drift && (
            <span
              className={`ml-0.5 text-[12px] font-medium ${
                cell.drift.delta > 0 ? "text-status-ok-fg" : "text-status-danger-fg"
              }`}
              aria-label="Desviación vs proyectado"
            >
              {cell.drift.delta > 0 ? "▲" : "▼"}
              {exec?.pct != null ? ` ${Math.round(exec.pct)}%` : ""}
            </span>
          )}
        </>
      )}
    </td>
  );
}
