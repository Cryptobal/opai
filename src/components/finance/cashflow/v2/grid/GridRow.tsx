"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { GridCell } from "./GridCell";
import { PendingColumnPulse } from "./PendingColumnPulse";
import { rowLabels, type BucketMeta, type GridItemRow } from "./grid-helpers";

/**
 * Fila de la grilla para una línea de contrato/instalación. Columna cliente
 * sticky y una celda por semana. Tab en create salta a la semana siguiente
 * abierta y vacía de la misma fila.
 */
export function GridRow({
  row,
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
  expandable,
  isChild,
  pendingKeys,
}: {
  row: GridItemRow;
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
  expandable?: { open: boolean; onToggle: () => void };
  isChild?: boolean;
  pendingKeys?: Set<string>;
}) {
  const group = row.group;
  const { primary, tag } = rowLabels(row.item);
  const isUf = row.item.currency === "UF";
  const headcount = row.item.headcount;
  const childCount = row.item.children?.length ?? 0;
  const open = expandable?.open ?? false;
  const isExtra = !!row.item.isExtraInvoice;
  const isDupProjection = !!row.item.collidesWithInvoice;
  const kind = row.kind ?? "EXPENSE";
  const [forceEditKey, setForceEditKey] = useState<string | null>(null);

  function tabToNext(fromKey: string) {
    const idx = buckets.findIndex((b) => b.key === fromKey);
    for (let i = idx + 1; i < buckets.length; i++) {
      const b = buckets[i];
      const meta = bucketMeta?.get(b.key);
      if (meta?.closed) continue;
      const amt = row.valueByBucket.get(b.key)?.amount ?? 0;
      if (amt !== 0) continue;
      setForceEditKey(b.key);
      return;
    }
  }

  return (
    <tr
      className={cn(
        "border-b border-ds-border-subtle hover:bg-ds-surface-2/60",
        expandable && "cursor-pointer select-none",
        isChild && "bg-ds-surface-2/40",
      )}
      onClick={expandable ? expandable.onToggle : undefined}
    >
      <td
        className={cn(
          "sticky left-0 z-10 min-w-[160px] max-w-[220px] max-md:min-w-[100px] max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-1 p-2",
          isChild && "bg-ds-surface-2/40 pl-8",
          isExtra && "pl-6",
        )}
      >
        <div className="flex items-center gap-1.5">
          {expandable && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Contraer" : "Expandir"} cuenta ${primary}`}
              onClick={(e) => {
                e.stopPropagation();
                expandable.onToggle();
              }}
              className="-m-1 shrink-0 rounded-ds-sm p-1 text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  open && "rotate-90",
                )}
              />
            </button>
          )}
          <span
            className={cn(
              "truncate font-medium text-ds-text-1",
              isChild ? "text-[12px] text-ds-text-3" : "text-[13px]",
            )}
          >
            {primary}
          </span>
          {isExtra && (
            <span
              className="shrink-0 rounded-ds-sm bg-tint-violet-soft px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-tint-violet-fg"
              title="Factura adicional de la misma semana"
            >
              + EXTRA
            </span>
          )}
          {isDupProjection && (
            <span
              className="shrink-0 rounded-ds-sm bg-tint-amber-soft px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-tint-amber-fg"
              title="Programación que quedó junto a una factura movida."
            >
              Programada
            </span>
          )}
          {isUf && (
            <span className="shrink-0 rounded-ds-sm bg-ds-surface-3 px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
              UF
            </span>
          )}
          {advanced && row.item.hasIpcAdjustment && (
            <span
              className="shrink-0 rounded-ds-sm bg-tint-violet-soft px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-tint-violet-fg"
              title={`Reajuste IPC${row.item.ipcAdjustmentMonths ? ` cada ${row.item.ipcAdjustmentMonths} meses` : ""}`}
            >
              IPC
            </span>
          )}
        </div>
        {expandable && childCount > 0 ? (
          <div className="truncate pl-[1.375rem] text-[12px] text-ds-text-3">
            {childCount} movimiento{childCount === 1 ? "" : "s"}
          </div>
        ) : (
          tag && (
            <div className="truncate text-[12px] text-ds-text-3">
              {tag}
              {advanced && headcount > 0 && (
                <span className="text-ds-text-4"> · {headcount} pers.</span>
              )}
            </div>
          )
        )}
      </td>
      {buckets.map((b, i) => {
        const meta = bucketMeta?.get(b.key);
        if (pendingKeys?.has(b.key)) {
          return (
            <td
              key={b.key}
              className={cn(
                "border-l border-ds-border-subtle bg-ds-surface-2/40 px-1.5 py-2",
                i === currentIdx && "bg-primary/[0.04]",
              )}
            >
              <PendingColumnPulse />
            </td>
          );
        }
        return (
          <GridCell
            key={b.key}
            itemId={row.item.itemId}
            itemName={row.item.nickname ?? row.item.itemName}
            source={row.item.source}
            kind={kind}
            categoryId={row.categoryId ?? null}
            value={row.valueByBucket.get(b.key)}
            bucketKey={b.key}
            bucketStart={b.start}
            weekLabel={b.label}
            isCurrent={i === currentIdx}
            dndEnabled={dndEnabled}
            closed={meta?.closed ?? false}
            isAnchor={meta?.anchor ?? false}
            advanced={advanced}
            isGroup={!!group}
            groupOccurrences={group?.occurrencesByBucket.get(b.key)}
            onAmountSaved={onAmountSaved}
            onCreated={onCreated}
            onHiddenFromFlow={onHiddenFromFlow}
            onTabNext={() => tabToNext(b.key)}
            forceEditing={forceEditKey === b.key ? "create" : null}
            onForceEditingConsumed={() => setForceEditKey(null)}
            isMobile={isMobile}
            editableAmounts={editableAmounts}
            buckets={buckets}
            bucketMeta={bucketMeta}
            onContextMove={
              onContextMove
                ? (toKey) =>
                    onContextMove({
                      itemId: row.item.itemId,
                      itemName: row.item.nickname ?? row.item.itemName,
                      fromBucketKey: b.key,
                      toBucketKey: toKey,
                      value: row.valueByBucket.get(b.key),
                      source: row.item.source,
                    })
                : undefined
            }
          />
        );
      })}
    </tr>
  );
}
