"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FinanceCashflowItemSource,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { GridChip } from "./GridChip";
import { GridDraggableChip } from "./GridDraggableChip";
import { cellChip } from "./grid-helpers";
import { AmountCellEditor } from "./AmountCellEditor";
import { CellFlowActions, type HideUndoPayload } from "./CellFlowActions";
import { CellActionSheet } from "./CellActionSheet";
import type { GridDragData } from "./useGridMove";

/**
 * Celda de la grilla (item × semana). Cuando el arrastre está habilitado y la
 * cuota es movible (no pagada, source arrastrable, semana abierta), el chip se
 * vuelve draggable y la celda droppable — el drop dispara el move unificado en
 * el padre. Solo son destino válido las columnas de la MISMA fila.
 */
export function GridCell({
  itemId,
  itemName,
  source,
  value,
  bucketKey,
  weekLabel,
  isCurrent,
  dndEnabled,
  closed = false,
  isAnchor = false,
  advanced = false,
  isGroup = false,
  groupOccurrences,
  onAmountSaved,
  onHiddenFromFlow,
  isMobile = false,
  editableAmounts = false,
}: {
  itemId: string;
  itemName: string;
  source: FinanceCashflowItemSource;
  value: ProjectionRowItemValue | undefined;
  bucketKey: string;
  /** Etiqueta legible de la semana (ej. "13 may") para el sheet de acciones. */
  weekLabel?: string;
  isCurrent: boolean;
  dndEnabled: boolean;
  /** Semana sellada (cierre): sin arrastre ni drop, atenuada. */
  closed?: boolean;
  /** Semana anclada: dibuja la línea de ancla (borde derecho de acento). */
  isAnchor?: boolean;
  /** Modo avanzado: revela el monto real conciliado y la varianza (Δ). */
  advanced?: boolean;
  /** La fila es un egreso agrupado (B4B): editar el total reparte proporcional
   *  entre las instalaciones de `groupOccurrences`. */
  isGroup?: boolean;
  groupOccurrences?: { id: string; amountClp: number }[];
  /** Se llama tras guardar/revertir un monto para refrescar la proyección. */
  onAmountSaved?: () => void;
  /** Tras ocultar del flujo: el padre refresca y arma undo. */
  onHiddenFromFlow?: (undo: HideUndoPayload) => void;
  /** Móvil: habilita el editar por tap y muestra el lápiz de affordance. */
  isMobile?: boolean;
  /** La sección admite editar montos (solo Egresos). Los Ingresos vienen de la
   *  factura y no se editan desde el flujo, así que la sección los pasa false. */
  editableAmounts?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // Sheet de acciones (ver detalle · editar · ocultar · ver factura) que abre al
  // tocar la celda. Centraliza lo que antes estaba disperso (doble-clic, ojo).
  const [sheetOpen, setSheetOpen] = useState(false);
  const amount = value?.amount ?? 0;
  const chip = value ? cellChip(value, source) : null;
  const canDrag = dndEnabled && !closed && amount !== 0 && !!chip?.draggable;
  // Editar monto: la casilla debe tener un target materializado (occurrence
  // individual o instalaciones del grupo), semana abierta y permisos. Las
  // pagadas (locked) no se editan — el backend igual las rechaza.
  const editTarget = isGroup
    ? (groupOccurrences?.length ?? 0) > 0
    : !!value?.occurrenceId;
  const canEdit =
    editableAmounts &&
    dndEnabled &&
    !closed &&
    amount !== 0 &&
    editTarget &&
    !chip?.locked;
  // Varianza (real − proyectado): oculta por defecto, visible en avanzado.
  const actual = value?.actualAmount ?? null;
  const variance = actual !== null ? actual - amount : null;

  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `drop::${itemId}::${bucketKey}`,
    data: { itemId, bucketKey },
    disabled: !dndEnabled || closed,
  });
  const activeItemId = (active?.data.current as GridDragData | undefined)?.itemId;
  const validTarget = isOver && activeItemId === itemId;

  const hasOverride = value?.hasAmountOverride ?? false;
  // El lápiz/anillo "editado manualmente" solo tiene sentido en celdas
  // editables. En una celda fija (conciliada) el monto override es el del
  // banco, no una edición manual — mostrarlo ahí era engañoso. El candado
  // (GridChip locked) comunica el estado de las fijas.
  const showOverrideBadge = hasOverride && canEdit;

  // Ocultar del flujo: facturas (dteId) o programaciones individuales. No en
  // grupos consolidados (sueldos), celdas fijas/cerradas ni anuladas (el
  // backend ya las filtra; si alguna llega, no mostrar el ojo).
  const canHideFromFlow =
    !!onHiddenFromFlow &&
    dndEnabled &&
    !closed &&
    !isGroup &&
    amount !== 0 &&
    !chip?.locked &&
    chip?.variant !== "VOIDED" &&
    (!!value?.dteId || !!value?.occurrenceId || !!itemId);

  // Interacción unificada (desktop + móvil): un toque/clic sobre una celda con
  // movimiento abre el sheet de acciones (ver detalle · editar · ocultar · ver
  // factura). El long-press sigue siendo el arrastre para mover (delay 180ms);
  // un toque corto no lo dispara y cae acá.
  const canOpenSheet = amount !== 0 && !!chip;
  function handleCellClick() {
    if (!canOpenSheet) return;
    setSheetOpen(true);
  }

  const chipNode =
    canDrag && value ? (
      <GridDraggableChip
        itemId={itemId}
        itemName={itemName}
        value={value}
        bucketKey={bucketKey}
        amount={amount}
        variant={chip!.variant}
        locked={chip!.locked}
        title={chip!.title}
      />
    ) : chip ? (
      <GridChip
        amount={amount}
        variant={chip.variant}
        locked={chip.locked}
        title={chip.title}
      />
    ) : null;

  return (
    <td
      ref={setDropRef}
      className={cn(
        "relative border-l border-ds-border-subtle px-1.5 py-1.5 text-center align-middle",
        isCurrent && "bg-primary/[0.04]",
        closed && "bg-ds-surface-2/50 opacity-60",
        isAnchor && "border-r-2 border-r-primary",
        validTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
      )}
    >
      {amount !== 0 && chipNode ? (
        <span
          // El onClick va en el chip (no en el <td>): el sheet se renderiza como
          // hermano dentro del td y sus eventos de portal burbujean por el árbol
          // de React hasta el td; si el handler estuviera en el td, cerrar el
          // sheet (X / click fuera) reabriría el sheet (parpadeo). El chip no es
          // ancestro del portal, así que no recibe esos eventos.
          onClick={canOpenSheet ? handleCellClick : undefined}
          role={canOpenSheet ? "button" : undefined}
          title={canOpenSheet ? "Ver acciones" : undefined}
          className={cn(
            "relative inline-flex",
            canOpenSheet && "cursor-pointer",
            showOverrideBadge && "rounded-ds-sm ring-1 ring-inset ring-primary/60",
          )}
        >
          {canHideFromFlow && value ? (
            <CellFlowActions
              target={{
                dteId: value.dteId ?? null,
                occurrenceId: value.occurrenceId,
                itemId,
                originalDate: value.scheduledDate,
                label: itemName,
              }}
              onHidden={(undo) => onHiddenFromFlow?.(undo)}
            >
              {chipNode}
            </CellFlowActions>
          ) : (
            chipNode
          )}
          {showOverrideBadge && (
            <Pencil
              className="absolute -right-1 -top-1 h-2.5 w-2.5 text-primary"
              aria-label="Monto editado manualmente"
            />
          )}
        </span>
      ) : (
        <span className="text-[12px] text-ds-text-4">·</span>
      )}
      {/* Affordance "editar" en móvil: lápiz neutro en la esquina inferior
          (distinto del badge de override —primary, arriba a la derecha—). Es
          decorativo (pointer-events-none): el tap lo captura el onClick de la
          celda, así nunca bloquea el long-press del chip arrastrable. */}
      {isMobile && canEdit && (
        <Pencil
          className="pointer-events-none absolute bottom-0.5 right-1 h-3 w-3 text-ds-text-3"
          aria-hidden
        />
      )}
      {editing && (
        <AmountCellEditor
          currentAmount={amount}
          isGroup={isGroup}
          occurrenceId={value?.occurrenceId ?? null}
          groupOccurrences={groupOccurrences}
          hasOverride={hasOverride}
          onClose={() => setEditing(false)}
          onSaved={() => onAmountSaved?.()}
        />
      )}
      {canOpenSheet && value && chip && (
        <CellActionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          itemName={itemName}
          weekLabel={weekLabel ?? bucketKey}
          amount={amount}
          actualAmount={actual}
          variant={chip.variant}
          statusTitle={chip.title}
          dteId={value.dteId ?? null}
          dteFolio={value.dteFolio ?? null}
          canEdit={canEdit}
          onEdit={() => setEditing(true)}
          canHide={canHideFromFlow}
          hideTarget={{
            dteId: value.dteId ?? null,
            occurrenceId: value.occurrenceId,
            itemId,
            originalDate: value.scheduledDate,
            label: itemName,
          }}
          onHidden={(undo) => onHiddenFromFlow?.(undo)}
        />
      )}
      {advanced && actual !== null && (
        <div
          className="mt-0.5 font-mono text-[11px] tabular-nums text-ds-text-3"
          title="Real conciliado (banco)"
        >
          {fmt.format(actual)}
          {variance !== null && variance !== 0 && (
            <span className="ml-1 text-ds-text-4">
              Δ{variance > 0 ? "+" : ""}
              {fmt.format(variance)}
            </span>
          )}
        </div>
      )}
    </td>
  );
}
