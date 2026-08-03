"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { GUTTER_CELL, GUTTER_W, NAME_LEFT, NAME_W, ROW_H } from "./grid-classes";
import { PlanillaCell } from "./PlanillaCell";
import { MenuItems, type MenuItemDesc } from "./menu-render";
import type { CellSel } from "./usePlanillaKeyboard";
import type { RangeRect } from "./range-sel";
import { cellRangeClass } from "./range-sel";
import type { NumberFormatMode } from "./format";
import type { CellStyle } from "./usePlanillaViewPrefs";

const DRAG_BLOCKED_MSG =
  "Las facturas y los movimientos conciliados no se mueven desde la planilla.";

interface Props {
  row: FlowMatrixRowDto;
  rowNumber: number;
  currentWeek: string;
  canManage: boolean;
  granularity: "week" | "month";
  sel: CellSel | null;
  /** Índice de esta fila en el orden visible (para pintar el rango). */
  visibleRowIdx: number;
  rangeRect: RangeRect | null;
  editing: { sel: CellSel; initial: string } | null;
  onSelect: (sel: CellSel, extend: boolean) => void;
  onSelectRow: () => void;
  onStartEdit: (sel: CellSel) => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancelEdit: () => void;
  onOpenPopover: (sel: CellSel, anchor: DOMRect) => void;
  /** Rename inline (estado izado al grid para poder dispararlo desde el menú). */
  isRenaming: boolean;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  /** Menú de la fila (para el dropdown del MoreHorizontal). */
  rowMenu: MenuItemDesc[];
  /** Registra esta fila como objetivo del menú contextual del grid. */
  onRowContext: () => void;
  /** Editabilidad completa por celda (semana abierta + no facturado, etc.). */
  canEditCell: (rowId: string, colIdx: number) => boolean;
  enableDrag: boolean;
  dropTarget: { rowId: string; colIdx: number } | null;
  onCellContext: (sel: CellSel) => void;
  onCellDragStart: (rowId: string, week: string) => void;
  onCellDragOver: (e: React.DragEvent, rowId: string, colIdx: number, week: string) => void;
  onCellDrop: (rowId: string, week: string) => void;
  onCellDragEnd: () => void;
  showChips?: boolean;
  numberFormat?: NumberFormatMode;
  getCellStyle?: (rowId: string, weekStart: string) => CellStyle | undefined;
  /** Tintar gutter cuando la fila tiene celda seleccionada. */
  rowSelected?: boolean;
  /** Query de búsqueda para resaltar coincidencias en el nombre. */
  searchQuery?: string;
}

function highlightName(name: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return name;
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const ni = norm(name).indexOf(norm(q));
  if (ni < 0) return name;
  // Mapear índice normalizado → índice original (aprox. por prefijo).
  let oi = 0;
  let ni2 = 0;
  const nName = norm(name);
  while (ni2 < ni && oi < name.length) {
    const ch = name[oi];
    const nch = ch.normalize("NFD").replace(/\p{M}/gu, "");
    ni2 += nch.length;
    oi += 1;
  }
  let end = oi;
  let consumed = 0;
  const nq = norm(q);
  while (consumed < nq.length && end < name.length) {
    const ch = name[end];
    const nch = ch.normalize("NFD").replace(/\p{M}/gu, "");
    consumed += nch.length;
    end += 1;
  }
  return (
    <>
      {name.slice(0, oi)}
      <mark className="rounded-sm bg-status-warn-soft text-ds-text-1">{name.slice(oi, end)}</mark>
      {name.slice(end)}
    </>
  );
}

export function PlanillaRow(p: Props) {
  const { row } = p;
  // Peek móvil: el concepto truncado se expande al tocarlo para ver el cliente
  // completo; se cierra solo o con otro tap.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (peekTimer.current) clearTimeout(peekTimer.current); }, []);
  const togglePeek = () => {
    if (p.isRenaming) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek((v) => {
      const next = !v;
      if (next) peekTimer.current = setTimeout(() => setPeek(false), 3000);
      return next;
    });
  };
  const showMenu = p.canManage && !row.isVirtual && p.rowMenu.length > 0;

  return (
    <tr className={`${ROW_H} group`}>
      <td
        aria-hidden
        className={`${GUTTER_W} ${ROW_H} ${GUTTER_CELL} z-10 cursor-pointer ${p.rowSelected ? "bg-[hsl(var(--plnx-sel-hdr))]" : ""}`}
        onClick={(e) => { e.stopPropagation(); p.onSelectRow(); }}
        title="Seleccionar fila"
      >
        {p.rowNumber}
      </td>
      <th
        scope="row"
        onClick={togglePeek}
        onContextMenu={showMenu ? p.onRowContext : undefined}
        className={`planilla-name-col ${NAME_W} ${ROW_H} sticky ${NAME_LEFT} z-10 border-b border-r border-ds-border-subtle/60 bg-ds-surface-1 px-1.5 max-md:px-1 text-left align-middle`}
      >
        {peek && (
          <span
            role="tooltip"
            className="absolute left-0 top-full z-30 max-w-[78vw] whitespace-normal rounded-md border border-ds-border-default bg-ds-surface-3 px-2 py-1 text-[12px] leading-snug text-ds-text-1 shadow-md"
          >
            {row.name}
          </span>
        )}
        {p.isRenaming ? (
          <input
            autoFocus
            defaultValue={row.name}
            className="h-[calc(var(--plnx-row-h)-4px)] max-md:h-7 w-full border border-primary bg-ds-surface-2 px-1 text-xs text-ds-text-1 outline-none"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") p.onRenameCommit((e.target as HTMLInputElement).value);
              else if (e.key === "Escape") p.onRenameCancel();
            }}
            onBlur={() => p.onRenameCancel()}
          />
        ) : (
          <span className="flex items-center gap-1">
            <span
              className={`truncate text-xs max-md:text-[12px] max-md:leading-none ${row.isArchived ? "text-ds-text-3" : "text-ds-text-2"}`}
              title={row.name}
            >
              {highlightName(row.name, p.searchQuery ?? "")}
            </span>
            {row.isArchived && (
              <span className="shrink-0 rounded border border-ds-border-subtle px-0.5 text-[12px] leading-tight text-ds-text-3">
                cerrada
              </span>
            )}
            {showMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    // Visible en touch (tap) y en desktop (hover). En móvil no hay
                    // botón derecho: este es el acceso al menú de fila.
                    className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:bg-ds-surface-2 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Acciones ${row.name}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 text-ds-text-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                  <MenuItems items={p.rowMenu} variant="dropdown" />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        )}
      </th>
      {row.cells.map((cell, colIdx) => {
        const isEditing =
          p.editing != null &&
          p.editing.sel.rowId === row.id &&
          p.editing.sel.colIdx === colIdx;
        const writable = p.canEditCell(row.id, colIdx);
        const draggable =
          p.enableDrag && writable && cell.layer === "plan" && cell.plan !== 0;
        const dragBlocked =
          p.enableDrag && (cell.layer === "committed" || cell.layer === "real")
            ? DRAG_BLOCKED_MSG
            : undefined;
        const rangeClass = isEditing
          ? ""
          : cellRangeClass(p.visibleRowIdx, colIdx, p.rangeRect, p.sel, row.id);
        return (
          <PlanillaCell
            key={cell.weekStart + colIdx}
            cell={cell}
            section={row.section}
            dataRc={`${row.id}:${colIdx}`}
            isCurrentCol={p.granularity === "week" && cell.weekStart === p.currentWeek}
            editable={writable}
            rangeClass={rangeClass}
            editingInitial={isEditing ? p.editing!.initial : null}
            onSelect={(extend) => p.onSelect({ rowId: row.id, colIdx }, extend)}
            onStartEdit={() => p.onStartEdit({ rowId: row.id, colIdx })}
            onCommit={p.onCommit}
            onCancel={p.onCancelEdit}
            onOpenPopover={(anchor) => p.onOpenPopover({ rowId: row.id, colIdx }, anchor)}
            onContextTarget={() => p.onCellContext({ rowId: row.id, colIdx })}
            draggable={draggable}
            onDragStartCell={() => p.onCellDragStart(row.id, cell.weekStart)}
            onDragOverCell={(e) => p.onCellDragOver(e, row.id, colIdx, cell.weekStart)}
            onDropCell={() => p.onCellDrop(row.id, cell.weekStart)}
            onDragEndCell={p.onCellDragEnd}
            isDropTarget={p.dropTarget?.rowId === row.id && p.dropTarget.colIdx === colIdx}
            dragBlockedTitle={dragBlocked}
            showChips={p.showChips}
            numberFormat={p.numberFormat}
            cellStyle={p.getCellStyle?.(row.id, cell.weekStart)}
          />
        );
      })}
    </tr>
  );
}
