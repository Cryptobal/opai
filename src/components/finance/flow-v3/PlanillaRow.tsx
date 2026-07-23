"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { GUTTER_CELL, GUTTER_W, NAME_LEFT, NAME_W, ROW_H } from "./grid-classes";
import { PlanillaCell } from "./PlanillaCell";
import type { CellSel } from "./usePlanillaKeyboard";

interface Props {
  row: FlowMatrixRowDto;
  /** Número visible en el gutter (correlativo de la hoja renderizada). */
  rowNumber: number;
  currentWeek: string;
  canManage: boolean;
  granularity: "week" | "month";
  sel: CellSel | null;
  editing: { sel: CellSel; initial: string } | null;
  onSelect: (sel: CellSel) => void;
  onStartEdit: (sel: CellSel) => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancelEdit: () => void;
  onOpenPopover: (sel: CellSel, anchor: DOMRect) => void;
  onRename: (rowId: string, name: string) => void;
  onArchive: (row: FlowMatrixRowDto) => void;
}

export function PlanillaRow(p: Props) {
  const { row } = p;
  const [renaming, setRenaming] = useState<string | null>(null);
  // Peek móvil: el concepto truncado se expande al tocarlo (overlay sobre las
  // celdas) para ver el cliente completo; se cierra solo o con otro tap.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (peekTimer.current) clearTimeout(peekTimer.current); }, []);
  const togglePeek = () => {
    if (renaming != null) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek((v) => {
      const next = !v;
      if (next) peekTimer.current = setTimeout(() => setPeek(false), 3000);
      return next;
    });
  };
  const editableRow =
    p.canManage && p.granularity === "week" && !row.isArchived && !row.isVirtual;

  return (
    <tr className={`${ROW_H} group`}>
      <td aria-hidden className={`${GUTTER_W} ${ROW_H} ${GUTTER_CELL} z-10`}>
        {p.rowNumber}
      </td>
      <th
        scope="row"
        onClick={togglePeek}
        className={`${NAME_W} ${ROW_H} sticky ${NAME_LEFT} z-10 border-b border-r border-ds-border-subtle/60 bg-ds-surface-1 px-1.5 max-md:px-1 text-left align-middle`}
      >
        {peek && (
          <span
            role="tooltip"
            className="absolute left-0 top-full z-30 max-w-[78vw] whitespace-normal rounded-md border border-ds-border-default bg-ds-surface-3 px-2 py-1 text-[12px] leading-snug text-ds-text-1 shadow-md"
          >
            {row.name}
          </span>
        )}
        {renaming != null ? (
          <input
            autoFocus
            defaultValue={row.name}
            className="h-[calc(var(--plnx-row-h)-4px)] max-md:h-7 w-full border border-primary bg-ds-surface-2 px-1 text-xs text-ds-text-1 outline-none"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                p.onRename(row.id, (e.target as HTMLInputElement).value);
                setRenaming(null);
              } else if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={() => setRenaming(null)}
          />
        ) : (
          <span className="flex items-center gap-1">
            <span
              className={`truncate text-xs max-md:text-[12px] max-md:leading-none ${row.isArchived ? "text-ds-text-3" : "text-ds-text-2"}`}
              title={row.name}
            >
              {row.name}
            </span>
            {row.isArchived && (
              <span className="shrink-0 rounded border border-ds-border-subtle px-0.5 font-mono text-[8px] uppercase leading-tight text-ds-text-3">
                cerrada
              </span>
            )}
            {editableRow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    // Solo desktop: se revela con hover (inexistente en touch);
                    // las acciones móviles de fila llegan con su bottom sheet.
                    className="ml-auto hidden shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-ds-surface-2 focus:opacity-100 group-hover:opacity-100 md:block"
                    aria-label={`Acciones ${row.name}`}
                  >
                    <MoreHorizontal className="h-3 w-3 text-ds-text-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setRenaming(row.name)}>
                    Renombrar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-status-danger-fg"
                    onSelect={() => p.onArchive(row)}
                  >
                    Archivar fila
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        )}
      </th>
      {row.cells.map((cell, colIdx) => {
        const isSel = p.sel?.rowId === row.id && p.sel.colIdx === colIdx;
        const isEditing =
          p.editing != null &&
          p.editing.sel.rowId === row.id &&
          p.editing.sel.colIdx === colIdx;
        const isPastCol = cell.weekStart < p.currentWeek && p.granularity === "week";
        return (
          <PlanillaCell
            key={cell.weekStart + colIdx}
            cell={cell}
            section={row.section}
            dataRc={`${row.id}:${colIdx}`}
            isCurrentCol={p.granularity === "week" && cell.weekStart === p.currentWeek}
            editable={editableRow && !isPastCol}
            selected={!!isSel && !isEditing}
            editingInitial={isEditing ? p.editing!.initial : null}
            onSelect={() => p.onSelect({ rowId: row.id, colIdx })}
            onStartEdit={() => p.onStartEdit({ rowId: row.id, colIdx })}
            onCommit={p.onCommit}
            onCancel={p.onCancelEdit}
            onOpenPopover={(anchor) => p.onOpenPopover({ rowId: row.id, colIdx }, anchor)}
          />
        );
      })}
    </tr>
  );
}
