"use client";
import type React from "react";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import type {
  ProjectionRow,
  ProjectionBucket,
} from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";
import { useDroppable } from "@dnd-kit/core";
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

  // Target agregado por bucket para popover/DnD de la fila colapsada.
  // Devolvemos el primer item con amount > 0 (incluyendo cuotas vírgenes
  // — itemId+scheduledDate basta para materializar al primer move).
  // Items `_orphan` (sin itemId real) se filtran porque el endpoint de
  // materialize requiere un UUID válido.
  function findAggregatedTarget(bucketKey: string) {
    for (const item of row.items) {
      if (item.itemId === "_orphan") continue;
      const cell = item.values.find((v) => v.bucketKey === bucketKey);
      if (cell && (cell.amount > 0 || cell.occurrenceId)) {
        return {
          id: cell.occurrenceId,
          itemId: item.itemId,
          originalDate: cell.scheduledDate,
          amountClp: cell.amount,
        };
      }
    }
    return null;
  }

  const onActionDoneSafe = onActionDone ?? (() => {});

  return (
    <>
      <tr className="hover:bg-muted/20">
        <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none border-r border-border/50">
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 w-full text-left min-h-[44px] sm:min-h-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            )}
            <span className="truncate">{row.categoryName}</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 shrink-0">
              ({row.items.length})
            </span>
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

          const aggregatedTarget = findAggregatedTarget(v.bucketKey);
          return (
            <DroppableBucketCell
              key={v.bucketKey}
              bucketKey={v.bucketKey}
              className="p-2 text-right text-ds-text-2 whitespace-nowrap"
            >
              <CellActionPopover
                target={aggregatedTarget}
                granularity={granularity}
                onActionDone={onActionDoneSafe}
              >
                {cellContent}
              </CellActionPopover>
            </DroppableBucketCell>
          );
        })}
        <td className="sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">
          {fmt.format(row.total)}
        </td>
      </tr>

      {expanded &&
        (() => {
          // Agrupar items por cliente (crmAccountName) cuando un cliente tiene
          // 2+ contratos en la misma categoría → sub-header con total. Si es 1
          // solo, va directo sin sub-header. "Sin cliente" agrupa los items
          // huérfanos (manual sin asociación a cuenta CRM).
          type Item = (typeof row.items)[number];
          const groups: Array<{ name: string; items: Item[] }> = [];
          const order: string[] = [];
          const byName = new Map<string, Item[]>();
          for (const it of row.items) {
            const key = it.crmAccountName ?? "—";
            if (!byName.has(key)) {
              byName.set(key, []);
              order.push(key);
            }
            byName.get(key)!.push(it);
          }
          for (const name of order) {
            groups.push({ name, items: byName.get(name)! });
          }
          const out: React.ReactNode[] = [];
          for (const g of groups) {
            if (g.items.length === 1 || g.name === "—") {
              for (const it of g.items) {
                out.push(
                  <ItemDetailRow
                    key={it.itemId}
                    item={it}
                    buckets={buckets}
                    granularity={granularity}
                    kind={row.kind as "INCOME" | "EXPENSE"}
                    onActionDone={onActionDoneSafe}
                  />,
                );
              }
              continue;
            }
            // 2+ items del mismo cliente: sub-header con total agregado.
            const groupTotalsByBucket = new Map<string, number>();
            for (const it of g.items) {
              for (const v of it.values) {
                groupTotalsByBucket.set(
                  v.bucketKey,
                  (groupTotalsByBucket.get(v.bucketKey) ?? 0) + v.amount,
                );
              }
            }
            const groupTotal = g.items.reduce((s, it) => s + it.total, 0);
            out.push(
              <ClientGroupHeaderRow
                key={`grp-${row.categoryCode}-${g.name}`}
                name={g.name}
                count={g.items.length}
                totalsByBucket={groupTotalsByBucket}
                buckets={buckets}
                grandTotal={groupTotal}
              />,
            );
            for (const it of g.items) {
              out.push(
                <ItemDetailRow
                  key={it.itemId}
                  item={it}
                  buckets={buckets}
                  granularity={granularity}
                  kind={row.kind as "INCOME" | "EXPENSE"}
                  onActionDone={onActionDoneSafe}
                />,
              );
            }
          }
          return out;
        })()}
    </>
  );
}

/**
 * Sub-header de cliente cuando hay 2+ contratos del mismo cliente en una
 * categoría. Sticky-left con nombre + (N), una celda por bucket con el
 * total agregado del cliente en ese período, y total general a la derecha.
 */
function ClientGroupHeaderRow({
  name,
  count,
  totalsByBucket,
  buckets,
  grandTotal,
}: {
  name: string;
  count: number;
  totalsByBucket: Map<string, number>;
  buckets: ProjectionBucket[];
  grandTotal: number;
}) {
  return (
    <tr className="bg-muted/30 border-t border-border/50">
      <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none border-r border-border/50">
        <div className="flex items-center gap-1.5 pl-2">
          <span className="text-[12px] font-semibold text-ds-text-1 truncate" title={name}>
            {name}
          </span>
          <span className="text-[11px] font-mono text-ds-text-4 shrink-0">
            ({count})
          </span>
        </div>
      </td>
      {buckets.map((b) => {
        const amount = totalsByBucket.get(b.key) ?? 0;
        return (
          <td
            key={b.key}
            className="p-2 text-right font-mono text-[12px] tabular-nums text-ds-text-2 whitespace-nowrap"
          >
            {amount > 0 ? fmt.format(amount) : "—"}
          </td>
        );
      })}
      <td className="sticky right-0 z-20 p-2 text-right font-mono text-[12px] font-semibold tabular-nums bg-card whitespace-nowrap border-l border-border/50">
        {fmt.format(grandTotal)}
      </td>
    </tr>
  );
}
