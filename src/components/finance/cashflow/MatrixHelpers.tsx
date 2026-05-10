"use client";
import type { ProjectionBucket, ProjectionRow, VirtualOccurrence } from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";
import { useDraggable, useDroppable } from "@dnd-kit/core";

export const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// DnD helper components
// ---------------------------------------------------------------------------

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
  /** false si la ocurrencia es PAID o no tiene id (virtual). */
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

// ---------------------------------------------------------------------------
// Helpers to find a representative draggable occurrence for a cell
// ---------------------------------------------------------------------------

/**
 * Given the full bucket list and the category/bucket coordinates, returns
 * the first occurrence that is materialized (has an id) and not PAID.
 * Returns null if none exists (cell is a pure aggregate / all conciliated).
 */
function findDraggableOccurrence(
  buckets: ProjectionBucket[],
  categoryId: string | null,
  bucketKey: string,
): VirtualOccurrence | null {
  const bucket = buckets.find((b) => b.key === bucketKey);
  if (!bucket) return null;
  return (
    bucket.occurrences.find(
      (o) =>
        (o.categoryId ?? "_") === (categoryId ?? "_") &&
        o.id !== null &&
        o.status !== "PAID",
    ) ?? null
  );
}

/**
 * Sticky positioning convention used across the matrix:
 *   - Left column (categoría): sticky left-0, z-20 in tbody, z-30 in thead/tfoot.
 *   - Right column (Total):    sticky right-0, z-20 in tbody, z-30 in thead/tfoot.
 *   - Bottom rows (subtotals, neto, saldo acumulado): sticky bottom-0
 *     with `bg-*` to cover content scrolled underneath.
 *   - Their corner cells (left+bottom or right+bottom) bump z-40 so they
 *     stay above adjacent sticky cells.
 */

export function MatrixRow({
  row,
  actualByCellKey,
  buckets,
  granularity,
  onActionDone,
}: {
  row: ProjectionRow;
  actualByCellKey?: Map<string, number>;
  /** When provided, cells become droppable and aggregate amounts become draggable. */
  buckets?: ProjectionBucket[];
  /** Required when buckets is set — drives popover semantics ("1 sem" en weekly, "1 mes" conceptual en monthly). */
  granularity?: "weekly" | "monthly";
  /** Callback tras una acción de mover/editar exitosa, para refrescar la matriz. */
  onActionDone?: () => void;
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="sticky left-0 z-20 bg-background p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none">
        {row.categoryName}
      </td>
      {row.values.map((v) => {
        const cellKey = `${row.categoryId ?? "_"}_${v.bucketKey}`;
        const actual = actualByCellKey?.has(cellKey)
          ? (actualByCellKey.get(cellKey) ?? null)
          : null;
        const variance =
          actual !== null ? actual - v.amount : null;

        const cellContent = (
          <CellAmount
            projected={v.amount}
            actual={actual}
            variance={variance}
            kind={row.kind as "INCOME" | "EXPENSE"}
          />
        );

        if (buckets) {
          // Find the first moveable occurrence for this category+bucket
          const occ = findDraggableOccurrence(buckets, row.categoryId, v.bucketKey);
          const target = occ ? { id: occ.id!, amountClp: occ.amountClp } : null;
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
                  target={target}
                  granularity={granularity ?? "weekly"}
                  onActionDone={onActionDone ?? (() => {})}
                >
                  {cellContent}
                </CellActionPopover>
              </DraggableOccurrenceChip>
            </DroppableBucketCell>
          );
        }

        return (
          <td key={v.bucketKey} className="p-2 text-right text-ds-text-2 whitespace-nowrap">
            {cellContent}
          </td>
        );
      })}
      <td className="sticky right-0 z-20 p-2 text-right font-mono bg-muted/40 whitespace-nowrap">
        {fmt.format(row.total)}
      </td>
    </tr>
  );
}

export function SectionHeader({
  label,
  colSpan,
  tone,
}: {
  label: string;
  colSpan: number;
  tone: "ok" | "warn";
}) {
  const cls =
    tone === "ok" ? "bg-status-ok-soft text-status-ok-fg" : "bg-status-warn-soft text-status-warn-fg";
  return (
    <tr className={cls}>
      <td colSpan={colSpan} className={`p-1.5 text-[11px] font-mono uppercase tracking-wider sticky left-0 z-30 ${cls}`}>
        {label}
      </td>
    </tr>
  );
}

export function SubtotalRow({
  label,
  rows,
  buckets,
  tone,
}: {
  label: string;
  rows: ProjectionRow[];
  buckets: ProjectionBucket[];
  tone: "ok" | "warn";
}) {
  const totals = buckets.map((b) =>
    rows.reduce((s, r) => s + (r.values.find((v) => v.bucketKey === b.key)?.amount ?? 0), 0),
  );
  const grand = totals.reduce((s, x) => s + x, 0);
  const cls = tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <tr className="border-t border-border font-medium bg-background">
      <td className="sticky left-0 z-20 bg-background p-2 whitespace-nowrap">{label}</td>
      {totals.map((t, i) => (
        <td key={i} className={`p-2 text-right font-mono whitespace-nowrap ${cls}`}>
          {fmt.format(t)}
        </td>
      ))}
      <td className={`sticky right-0 z-20 p-2 text-right font-mono bg-muted/40 whitespace-nowrap ${cls}`}>
        {fmt.format(grand)}
      </td>
    </tr>
  );
}
