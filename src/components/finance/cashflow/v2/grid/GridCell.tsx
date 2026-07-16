"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FinanceCashflowItemKind,
  FinanceCashflowItemSource,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { GridChip } from "./GridChip";
import { GridDraggableChip } from "./GridDraggableChip";
import { canEditValue, cellChip, type BucketMeta } from "./grid-helpers";
import { InlineCellEditor } from "./InlineCellEditor";
import {
  CellFlowActions,
  type HiddenFromFlowPayload,
} from "./CellFlowActions";
import { CellActionSheet } from "./CellActionSheet";
import { CellContextMenu, openWeekTargets } from "./CellContextMenu";
import { hideFromFlowViaApi } from "./cashflow-hide";
import { createManualEntryViaApi } from "./cashflow-create";
import { rangeFromBucketKeys } from "./return-range-client";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { toast } from "sonner";
import type { GridDragData } from "./useGridMove";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";

const ymd = (d: string | Date) => toDate(d).toISOString().slice(0, 10);

/**
 * Celda de la grilla (item × semana). Vacía + editable → click abre create
 * inline; con cuota → sheet al tap, edit por dbl-click / menú (F2).
 */
export function GridCell({
  itemId,
  itemName,
  source,
  kind = "EXPENSE",
  categoryId = null,
  value,
  bucketKey,
  bucketStart,
  weekLabel,
  isCurrent,
  dndEnabled,
  closed = false,
  isAnchor = false,
  advanced = false,
  isGroup = false,
  groupOccurrences,
  onAmountSaved,
  onCreated,
  onHiddenFromFlow,
  onTabNext,
  forceEditing = null,
  onForceEditingConsumed,
  isMobile = false,
  editableAmounts = false,
  buckets = [],
  bucketMeta,
  onContextMove,
}: {
  itemId: string;
  itemName: string;
  source: FinanceCashflowItemSource;
  kind?: FinanceCashflowItemKind;
  categoryId?: string | null;
  value: ProjectionRowItemValue | undefined;
  bucketKey: string;
  /** Lunes de la semana — scheduledDate al crear. */
  bucketStart: string | Date;
  weekLabel?: string;
  isCurrent: boolean;
  dndEnabled: boolean;
  closed?: boolean;
  isAnchor?: boolean;
  advanced?: boolean;
  isGroup?: boolean;
  groupOccurrences?: { id: string; amountClp: number }[];
  onAmountSaved?: (patch?: {
    itemId: string;
    bucketKey: string;
    amount?: number;
    projection?: ProjectionMatrix;
  }) => void;
  onCreated?: (patch: {
    itemId: string;
    bucketKey: string;
    amount: number;
    projection?: ProjectionMatrix;
  }) => void;
  onHiddenFromFlow?: (undo: HiddenFromFlowPayload) => void;
  onTabNext?: () => void;
  /** Abre el editor (create) desde el padre (Tab desde semana anterior). */
  forceEditing?: "create" | "edit" | null;
  onForceEditingConsumed?: () => void;
  isMobile?: boolean;
  editableAmounts?: boolean;
  buckets?: ProjectionBucket[];
  bucketMeta?: Map<string, BucketMeta>;
  /** Move desde el menú contextual (misma vía que el drag). */
  onContextMove?: (toBucketKey: string) => void;
}) {
  const [editing, setEditing] = useState<"edit" | "create" | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!forceEditing) return;
    setEditing(forceEditing);
    onForceEditingConsumed?.();
  }, [forceEditing, onForceEditingConsumed]);

  const amount = value?.amount ?? 0;
  const chip = value ? cellChip(value, source) : null;
  const canDrag = dndEnabled && !closed && amount !== 0 && !!chip?.draggable;
  const editTarget = isGroup
    ? (groupOccurrences?.length ?? 0) > 0
    : !!value?.occurrenceId;
  const canEdit =
    editableAmounts &&
    dndEnabled &&
    editTarget &&
    canEditValue(value, source, kind, closed);
  const canCreate =
    editableAmounts &&
    dndEnabled &&
    !closed &&
    !isGroup &&
    amount === 0;
  const actual = value?.actualAmount ?? null;
  const variance = actual !== null ? actual - amount : null;
  const hasOverride = value?.hasAmountOverride ?? false;
  const showOverrideBadge = hasOverride && canEdit;
  const activeEditing = editing;

  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `drop::${itemId}::${bucketKey}`,
    data: { itemId, bucketKey },
    disabled: !dndEnabled || closed,
  });
  const activeItemId = (active?.data.current as GridDragData | undefined)?.itemId;
  const validTarget = isOver && activeItemId === itemId;

  const canHideFromFlow =
    !!onHiddenFromFlow &&
    dndEnabled &&
    !closed &&
    !isGroup &&
    amount !== 0 &&
    (!!value?.dteId || !!value?.occurrenceId || !!itemId);

  const canOpenSheet = amount !== 0 && !!chip;
  const openWeeks = openWeekTargets(buckets, bucketMeta, bucketKey);
  const locked = !!chip?.locked;

  async function hideFromMenu() {
    if (!value || !onHiddenFromFlow) return;
    const returnRange = rangeFromBucketKeys([bucketKey]);
    const res = await hideFromFlowViaApi({
      dteId: value.dteId ?? null,
      occurrenceId: value.occurrenceId,
      itemId,
      originalDate: value.scheduledDate,
      label: itemName,
      returnRange,
    });
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo ocultar");
      return;
    }
    onHiddenFromFlow({
      label: itemName,
      dteId: value.dteId ?? null,
      occurrenceId: res.occurrenceId ?? value.occurrenceId,
      itemId,
      bucketKey,
      projection: res.projection,
    });
  }

  async function duplicateTo(toKey: string) {
    const dest = buckets.find((b) => b.key === toKey);
    if (!dest || amount === 0) return;
    const returnRange = rangeFromBucketKeys([toKey]);
    const res = await createManualEntryViaApi({
      kind,
      name: itemName,
      amountClp: Math.round(amount),
      scheduledDate: ymd(dest.start),
      categoryId,
      returnRange,
    });
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo duplicar");
      return;
    }
    toast.success(`Duplicado en ${dest.label}`);
    onCreated?.({
      itemId: res.id ?? itemId,
      bucketKey: toKey,
      amount: Math.round(amount),
      projection: res.projection,
    });
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
        caption={chip!.caption}
      />
    ) : chip ? (
      <GridChip
        amount={amount}
        variant={chip.variant}
        locked={chip.locked}
        title={chip.title}
        caption={chip.caption}
      />
    ) : null;

  return (
    <td
      ref={setDropRef}
      className={cn(
        "group/cell relative border-l border-ds-border-subtle px-1.5 py-1.5 text-center align-middle",
        isCurrent && "bg-primary/[0.04]",
        closed && "bg-ds-surface-2/50 opacity-60",
        isAnchor && "border-r-2 border-r-primary",
        validTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
        canCreate && "cursor-pointer",
      )}
      onClick={() => {
        if (canCreate && !activeEditing) setEditing("create");
      }}
      onDoubleClick={(e) => {
        if (!canEdit) return;
        e.stopPropagation();
        setEditing("edit");
      }}
    >
      <CellContextMenu
        itemName={itemName}
        weekLabel={weekLabel ?? bucketKey}
        amount={amount}
        statusTitle={chip?.title ?? "Vacía"}
        kindLabel={kind === "INCOME" ? "ingreso" : "egreso"}
        empty={amount === 0}
        closed={closed}
        locked={locked}
        canEdit={canEdit}
        canHide={canHideFromFlow}
        canMove={canDrag}
        dteId={value?.dteId}
        dteFolio={value?.dteFolio}
        openWeeks={openWeeks}
        onAddHere={() => setEditing("create")}
        onEdit={() => setEditing("edit")}
        onMoveTo={(k) => onContextMove?.(k)}
        onDuplicateTo={(k) => void duplicateTo(k)}
        onOpenDetail={() => setSheetOpen(true)}
        onHide={() => void hideFromMenu()}
      >
        {amount !== 0 && chipNode ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (canOpenSheet) setSheetOpen(true);
            }}
            role={canOpenSheet ? "button" : undefined}
            title={canOpenSheet ? "Ver acciones" : undefined}
            tabIndex={canOpenSheet ? 0 : undefined}
            className={cn(
              "relative inline-flex",
              canOpenSheet && "cursor-pointer",
              showOverrideBadge &&
                "rounded-ds-sm ring-1 ring-inset ring-primary/60",
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
                onHidden={(undo) =>
                  onHiddenFromFlow?.({ ...undo, itemId, bucketKey })
                }
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
          <span className="relative inline-flex h-8 w-full items-center justify-center">
            <span className="text-[12px] text-ds-text-4 group-hover/cell:opacity-0">
              ·
            </span>
            {canCreate && (
              <Plus
                className="pointer-events-none absolute h-4 w-4 text-ds-text-4 opacity-0 transition-opacity group-hover/cell:opacity-70"
                aria-hidden
              />
            )}
          </span>
        )}
      </CellContextMenu>
      {isMobile && canEdit && (
        <Pencil
          className="pointer-events-none absolute bottom-0.5 right-1 h-3 w-3 text-ds-text-3"
          aria-hidden
        />
      )}
      {activeEditing && (
        <InlineCellEditor
          mode={activeEditing}
          currentAmount={amount}
          isGroup={isGroup}
          occurrenceId={value?.occurrenceId ?? null}
          groupOccurrences={groupOccurrences}
          hasOverride={hasOverride}
          itemId={itemId}
          itemName={itemName}
          kind={kind}
          categoryId={categoryId}
          scheduledDate={ymd(bucketStart)}
          returnRange={rangeFromBucketKeys([bucketKey])}
          onClose={() => setEditing(null)}
          onSaved={(optimisticAmount, projection) =>
            onAmountSaved?.({
              itemId,
              bucketKey,
              ...(optimisticAmount != null ? { amount: optimisticAmount } : {}),
              projection,
            })
          }
          onCreated={(patch) =>
            onCreated?.({
              itemId: patch.itemId,
              bucketKey,
              amount: patch.amount,
              projection: patch.projection,
            })
          }
          onTabNext={onTabNext}
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
          onEdit={() => setEditing("edit")}
          canHide={canHideFromFlow}
          hideTarget={{
            dteId: value.dteId ?? null,
            occurrenceId: value.occurrenceId,
            itemId,
            originalDate: value.scheduledDate,
            label: itemName,
          }}
          onHidden={(undo) =>
            onHiddenFromFlow?.({ ...undo, itemId, bucketKey })
          }
          source={source}
          hasAmountOverride={value.hasAmountOverride}
          scheduledDate={value.scheduledDate}
          bucketStart={bucketStart}
        />
      )}
      {advanced && actual !== null && (
        <div
          className="mt-0.5 font-mono text-[12px] tabular-nums text-ds-text-3"
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
