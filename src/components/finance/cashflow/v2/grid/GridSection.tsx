"use client";

import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { GridRow } from "./GridRow";
import {
  sectionBucketTotals,
  type BucketMeta,
  type GridItemRow,
} from "./grid-helpers";

/**
 * Sección de la grilla (Ingresos o Egresos): banda de título con tono
 * semántico, una fila por línea de contrato/instalación y una fila de subtotal
 * por semana. Ingresos van arriba, Egresos abajo.
 */
export function GridSection({
  label,
  tone,
  rows,
  buckets,
  currentIdx,
  dndEnabled,
  bucketMeta,
  advanced,
  onAmountSaved,
  isMobile,
  editableAmounts,
}: {
  label: string;
  tone: "ok" | "warn";
  rows: GridItemRow[];
  buckets: ProjectionBucket[];
  currentIdx: number;
  dndEnabled: boolean;
  bucketMeta?: Map<string, BucketMeta>;
  advanced?: boolean;
  onAmountSaved?: () => void;
  /** Móvil: editar por tap + lápiz de affordance en las celdas editables. */
  isMobile?: boolean;
  /** La sección admite editar montos (solo Egresos; ver GridCell). */
  editableAmounts?: boolean;
}) {
  const totals = sectionBucketTotals(rows, buckets);
  const headTone =
    tone === "ok"
      ? "bg-status-ok-soft text-status-ok-fg"
      : "bg-status-warn-soft text-status-warn-fg";
  const totalTone = tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <>
      <tr className={headTone}>
        <td
          colSpan={buckets.length + 1}
          className={cn(
            "p-1.5 text-[11px] font-mono uppercase tracking-[0.08em]",
            headTone,
          )}
        >
          <span className="sticky left-2 inline-block">{label}</span>
        </td>
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
        rows.map((row) => (
          <GridRow
            key={row.item.itemId}
            row={row}
            buckets={buckets}
            currentIdx={currentIdx}
            dndEnabled={dndEnabled}
            bucketMeta={bucketMeta}
            advanced={advanced}
            onAmountSaved={onAmountSaved}
            isMobile={isMobile}
            editableAmounts={editableAmounts}
          />
        ))
      )}
      {/* Subtotal por semana */}
      <tr className="border-b border-ds-border-default bg-ds-surface-2 font-medium">
        <td className="sticky left-0 z-10 max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-2 p-2 text-[12px] text-ds-text-1">
          Subtotal {label.toLowerCase()}
        </td>
        {totals.map((t, i) => {
          const meta = bucketMeta?.get(buckets[i].key);
          return (
            <td
              key={buckets[i].key}
              className={cn(
                "border-l border-ds-border-subtle px-1.5 py-1.5 text-center font-mono text-[12px] tabular-nums",
                totalTone,
                i === currentIdx && "bg-primary/[0.04]",
                meta?.closed && "opacity-60",
                meta?.anchor && "border-r-2 border-r-primary",
              )}
            >
              {t !== 0 ? fmt.format(t) : "·"}
            </td>
          );
        })}
      </tr>
    </>
  );
}
