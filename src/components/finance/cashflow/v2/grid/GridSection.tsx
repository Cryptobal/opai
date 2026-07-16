"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { AddConceptRow } from "./AddConceptRow";
import { GridRow } from "./GridRow";
import type { ConceptOption } from "./concept-options";
import {
  childGridRow,
  sectionBucketTotals,
  type BucketMeta,
  type GridItemRow,
} from "./grid-helpers";

/**
 * Sección Ingresos/Egresos: banda de título CON totales por semana (F3),
 * filas de ítems, y fila fantasma "+ Agregar…" si se puede editar.
 */
export function GridSection({
  label,
  tone,
  kind,
  rows,
  buckets,
  currentIdx,
  dndEnabled,
  bucketMeta,
  advanced,
  onAmountSaved,
  onCreated,
  onHiddenFromFlow,
  onContextMove,
  isMobile,
  editableAmounts,
  pendingKeys,
  conceptOptions,
}: {
  label: string;
  tone: "ok" | "warn";
  kind: "INCOME" | "EXPENSE";
  rows: GridItemRow[];
  buckets: ProjectionBucket[];
  currentIdx: number;
  dndEnabled: boolean;
  bucketMeta?: Map<string, BucketMeta>;
  advanced?: boolean;
  onAmountSaved?: (patch?: {
    itemId: string;
    bucketKey: string;
    amount?: number;
  }) => void;
  onCreated?: (patch: {
    itemId: string;
    bucketKey: string;
    amount: number;
  }) => void;
  onHiddenFromFlow?: (undo: import("./CellFlowActions").HiddenFromFlowPayload) => void;
  onContextMove?: (args: {
    itemId: string;
    itemName: string;
    fromBucketKey: string;
    toBucketKey: string;
    value: import("@/modules/finance/cashflow/types").ProjectionRowItemValue | undefined;
    source: import("@/modules/finance/cashflow/types").FinanceCashflowItemSource;
  }) => void;
  isMobile?: boolean;
  editableAmounts?: boolean;
  pendingKeys?: Set<string>;
  conceptOptions?: ConceptOption[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const totals = sectionBucketTotals(rows, buckets);
  const headTone =
    tone === "ok"
      ? "bg-status-ok-soft text-status-ok-fg"
      : "bg-status-warn-soft text-status-warn-fg";
  const totalTone =
    tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";

  return (
    <>
      <tr className={cn("border-b border-ds-border-subtle", headTone)}>
        <td
          className={cn(
            "sticky left-0 z-10 max-md:max-w-[128px] border-r border-ds-border-default p-1.5 text-[12px] font-mono uppercase tracking-[0.08em]",
            headTone,
          )}
        >
          {label}
        </td>
        {totals.map((t, i) => {
          const key = buckets[i].key;
          if (pendingKeys?.has(key)) {
            return (
              <td
                key={key}
                className={cn(
                  "border-l border-ds-border-subtle px-1.5 py-1.5",
                  headTone,
                )}
              >
                <span
                  aria-hidden
                  className="mx-auto block h-3 w-10 rounded-ds-sm bg-ds-surface-3/60 motion-safe:animate-pulse"
                />
              </td>
            );
          }
          const meta = bucketMeta?.get(key);
          return (
            <td
              key={key}
              className={cn(
                "border-l border-ds-border-subtle px-1.5 py-1.5 text-center font-mono text-[12px] tabular-nums text-ds-text-3",
                headTone,
                t !== 0 && totalTone,
                i === currentIdx && "bg-primary/[0.06]",
                meta?.closed && "opacity-60",
                meta?.anchor && "border-r-2 border-r-primary",
              )}
            >
              {t !== 0 ? fmt.format(t) : "·"}
            </td>
          );
        })}
      </tr>
      {rows.length === 0 ? (
        <tr className="border-b border-ds-border-subtle">
          <td
            colSpan={buckets.length + 1}
            className="p-3 text-center text-[12px] text-ds-text-4"
          >
            Sin líneas en este rango.
          </td>
        </tr>
      ) : (
        rows.map((row) => {
          const itemId = row.item.itemId;
          const isExpandableRow =
            !!row.item.isConciliacionGroup &&
            (row.item.children?.length ?? 0) > 0;
          const open = expanded.has(itemId);
          return (
            <Fragment key={itemId}>
              <GridRow
                row={row}
                buckets={buckets}
                currentIdx={currentIdx}
                dndEnabled={dndEnabled}
                bucketMeta={bucketMeta}
                advanced={advanced}
                onAmountSaved={onAmountSaved}
                onCreated={onCreated}
                onHiddenFromFlow={onHiddenFromFlow}
                onContextMove={onContextMove}
                isMobile={isMobile}
                editableAmounts={editableAmounts}
                pendingKeys={pendingKeys}
                expandable={
                  isExpandableRow
                    ? { open, onToggle: () => toggle(itemId) }
                    : undefined
                }
              />
              {isExpandableRow &&
                open &&
                row.item.children!.map((child) => (
                  <GridRow
                    key={`${itemId}::${child.itemId}`}
                    row={childGridRow(child)}
                    buckets={buckets}
                    currentIdx={currentIdx}
                    dndEnabled={dndEnabled}
                    bucketMeta={bucketMeta}
                    advanced={advanced}
                    onAmountSaved={onAmountSaved}
                    onCreated={onCreated}
                    onHiddenFromFlow={onHiddenFromFlow}
                    onContextMove={onContextMove}
                    isMobile={isMobile}
                    editableAmounts={editableAmounts}
                    pendingKeys={pendingKeys}
                    isChild
                  />
                ))}
            </Fragment>
          );
        })
      )}
      {editableAmounts && onCreated && conceptOptions && (
        <AddConceptRow
          kind={kind}
          buckets={buckets}
          currentIdx={currentIdx}
          bucketMeta={bucketMeta}
          options={conceptOptions}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
