"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import type {
  ProjectionRow,
  ProjectionBucket,
} from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ItemDetailRow } from "./ItemDetailRow";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const STORAGE_PREFIX = "cashflow.expanded.";

function isExpandedInStorage(categoryId: string | null): boolean {
  if (typeof window === "undefined" || !categoryId) return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + categoryId) === "1";
  } catch {
    return false;
  }
}

function setExpandedInStorage(categoryId: string | null, expanded: boolean) {
  if (typeof window === "undefined" || !categoryId) return;
  try {
    if (expanded) {
      window.localStorage.setItem(STORAGE_PREFIX + categoryId, "1");
    } else {
      window.localStorage.removeItem(STORAGE_PREFIX + categoryId);
    }
  } catch {
    // ignore
  }
}

function DroppableBucketCell({
  bucketKey,
  children,
  className = "",
}: {
  bucketKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucketKey });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-status-info-soft transition-colors" : ""}`}
    >
      {children}
    </td>
  );
}

function DraggableOccurrenceChip({
  occurrenceId,
  draggable,
  children,
}: {
  occurrenceId: string | null;
  draggable: boolean;
  children: React.ReactNode;
}) {
  const dragId = occurrenceId ? `occ-${occurrenceId}` : "noop";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: draggable ? (isDragging ? "grabbing" : "grab") : "default",
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      {children}
    </span>
  );
}

interface Props {
  row: ProjectionRow;
  actualByCellKey?: Map<string, number>;
  buckets: ProjectionBucket[];
  granularity: "weekly" | "monthly";
  onActionDone?: () => void;
}

/**
 * Fila de categoría con chevron para expandir y ver el desglose por item
 * (instalación / contrato / template). El estado expandido persiste en
 * localStorage por categoryId.
 */
export function ExpandableMatrixRow({
  row,
  actualByCellKey,
  buckets,
  granularity,
  onActionDone,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(isExpandedInStorage(row.categoryId));
  }, [row.categoryId]);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      setExpandedInStorage(row.categoryId, next);
      return next;
    });
  }

  // Encontrar la primera ocurrencia movible por bucket (para popover/DnD de
  // la fila colapsada — agregada).
  function findOcc(bucketKey: string) {
    for (const item of row.items) {
      const cell = item.values.find((v) => v.bucketKey === bucketKey);
      if (cell?.occurrenceId) {
        return { id: cell.occurrenceId, amountClp: cell.amount };
      }
    }
    return null;
  }

  const hasItems = row.items.length > 0;
  const onActionDoneSafe = onActionDone ?? (() => {});

  return (
    <>
      <tr className="hover:bg-muted/20">
        <td className="sticky left-0 z-20 bg-background p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none">
          <button
            type="button"
            onClick={toggle}
            disabled={!hasItems}
            className="flex items-center gap-1.5 w-full text-left disabled:cursor-default"
          >
            {hasItems ? (
              expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="truncate">{row.categoryName}</span>
            {hasItems && (
              <span className="text-[10px] text-ds-text-3 shrink-0">
                ({row.items.length})
              </span>
            )}
          </button>
        </td>
        {row.values.map((v) => {
          const cellKey = `${row.categoryId ?? "_"}_${v.bucketKey}`;
          const actual = actualByCellKey?.has(cellKey)
            ? (actualByCellKey.get(cellKey) ?? null)
            : null;
          const variance = actual !== null ? actual - v.amount : null;

          const cellContent = (
            <CellAmount
              projected={v.amount}
              actual={actual}
              variance={variance}
              kind={row.kind as "INCOME" | "EXPENSE"}
            />
          );

          const occ = findOcc(v.bucketKey);
          return (
            <DroppableBucketCell
              key={v.bucketKey}
              bucketKey={v.bucketKey}
              className="p-2 text-right text-ds-text-2 whitespace-nowrap"
            >
              <DraggableOccurrenceChip
                occurrenceId={occ?.id ?? null}
                draggable={occ !== null}
              >
                <CellActionPopover
                  target={occ}
                  granularity={granularity}
                  onActionDone={onActionDoneSafe}
                >
                  {cellContent}
                </CellActionPopover>
              </DraggableOccurrenceChip>
            </DroppableBucketCell>
          );
        })}
        <td className="sticky right-0 z-20 p-2 text-right font-mono bg-muted/40 whitespace-nowrap">
          {fmt.format(row.total)}
        </td>
      </tr>

      {expanded &&
        row.items.map((item) => (
          <ItemDetailRow
            key={item.itemId}
            item={item}
            buckets={buckets}
            granularity={granularity}
            kind={row.kind as "INCOME" | "EXPENSE"}
            onActionDone={onActionDoneSafe}
          />
        ))}
    </>
  );
}
