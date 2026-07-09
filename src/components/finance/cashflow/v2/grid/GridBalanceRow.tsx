"use client";

import { Anchor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type { BucketMeta } from "./grid-helpers";

/**
 * Fila FC — saldo acumulado proyectado por semana (verde ≥ 0, rojo < 0).
 * Horizontal, sellada abajo (sticky) para leer la trayectoria del saldo
 * mientras se hace scroll de las secciones. En la semana anclada muestra el
 * saldo anclado (ícono de ancla + línea de frontera); las semanas cerradas van
 * atenuadas.
 */
export function GridBalanceRow({
  buckets,
  balanceByBucket,
  currentIdx,
  bucketMeta,
}: {
  buckets: ProjectionBucket[];
  /** bucketKey → saldo acumulado proyectado (cumulativeBalances). */
  balanceByBucket: Map<string, number>;
  currentIdx: number;
  bucketMeta?: Map<string, BucketMeta>;
}) {
  return (
    <tr className="sticky bottom-0 z-10 border-t-2 border-ds-border-strong bg-ds-surface-2 font-semibold">
      <td className="sticky left-0 z-20 max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-2 p-2 text-[12px] font-semibold text-ds-text-1">
        FC · saldo acumulado
      </td>
      {buckets.map((b, i) => {
        const bal = balanceByBucket.get(b.key);
        const hasBal = bal !== undefined;
        const negative = hasBal && bal < 0;
        const meta = bucketMeta?.get(b.key);
        return (
          <td
            key={b.key}
            className={cn(
              "border-l border-ds-border-subtle px-1.5 py-2 text-center font-mono text-[12px] tabular-nums",
              !hasBal
                ? "text-ds-text-4"
                : negative
                  ? "text-status-danger-fg"
                  : "text-status-ok-fg",
              i === currentIdx && "bg-primary/[0.06]",
              meta?.closed && "opacity-70",
              meta?.anchor && "border-r-2 border-r-primary",
            )}
            title={meta?.anchor ? "Saldo anclado al cierre" : undefined}
          >
            {meta?.anchor && (
              <Anchor
                className="mr-0.5 inline-block h-3 w-3 align-[-1px] text-primary"
                aria-hidden
              />
            )}
            {hasBal ? fmt.format(bal) : "·"}
          </td>
        );
      })}
    </tr>
  );
}
