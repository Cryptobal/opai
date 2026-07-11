"use client";

import { useRef, useState } from "react";
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
  isCurrent,
  dndEnabled,
  closed = false,
  isAnchor = false,
  advanced = false,
  isGroup = false,
  groupOccurrences,
  onAmountSaved,
  isMobile = false,
  editableAmounts = false,
}: {
  itemId: string;
  itemName: string;
  source: FinanceCashflowItemSource;
  value: ProjectionRowItemValue | undefined;
  bucketKey: string;
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
  /** Móvil: habilita el editar por tap y muestra el lápiz de affordance. */
  isMobile?: boolean;
  /** La sección admite editar montos (solo Egresos). Los Ingresos vienen de la
   *  factura y no se editan desde el flujo, así que la sección los pasa false. */
  editableAmounts?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // Timestamp del último tap para detectar el doble-tap en móvil (ver comentario
  // sobre los disparadores de edición más abajo).
  const lastTapRef = useRef(0);
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

  // Disparadores de edición según dispositivo. La regla de gestos en móvil es:
  //  - tap corto  → nada (evita aperturas accidentales por roces).
  //  - long-press → arrastrar la cuota (drag: delay 180ms + movimiento).
  //  - doble-tap  → editar el monto (abre el modal), análogo al doble-clic de
  //    desktop pero adaptado a touch.
  // Desktop: doble-clic (no colisiona con el drag, que es single-click + arrastre).
  // El doble-tap se detecta comparando el tap actual con el anterior dentro de
  // una ventana de ~300ms sobre la misma casilla; un tap suelto sin movimiento
  // no arranca el drag (no alcanza el long-press) y cae en este handler.
  function handleMobileTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      setEditing(true);
    } else {
      lastTapRef.current = now;
    }
  }

  return (
    <td
      ref={setDropRef}
      onDoubleClick={!isMobile && canEdit ? () => setEditing(true) : undefined}
      onClick={isMobile && canEdit ? handleMobileTap : undefined}
      className={cn(
        "relative border-l border-ds-border-subtle px-1.5 py-1.5 text-center align-middle",
        isCurrent && "bg-primary/[0.04]",
        closed && "bg-ds-surface-2/50 opacity-60",
        isAnchor && "border-r-2 border-r-primary",
        validTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
        canEdit && (isMobile ? "cursor-pointer" : "cursor-text"),
      )}
      aria-label={
        canEdit && isMobile ? "Doble toque para editar el monto" : undefined
      }
      title={
        canEdit
          ? isMobile
            ? "Doble toque para editar el monto"
            : "Doble clic para editar el monto"
          : undefined
      }
    >
      {amount !== 0 && chip ? (
        <span
          className={cn(
            "relative inline-flex",
            showOverrideBadge && "rounded-ds-sm ring-1 ring-inset ring-primary/60",
          )}
        >
          {canDrag && value ? (
            <GridDraggableChip
              itemId={itemId}
              itemName={itemName}
              value={value}
              bucketKey={bucketKey}
              amount={amount}
              variant={chip.variant}
              locked={chip.locked}
              title={chip.title}
            />
          ) : (
            <GridChip
              amount={amount}
              variant={chip.variant}
              locked={chip.locked}
              title={chip.title}
            />
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
