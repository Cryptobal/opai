"use client";

import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";

/**
 * Fila FC — saldo acumulado proyectado por semana (verde ≥ 0, rojo < 0).
 * Horizontal, sellada abajo (sticky) para leer la trayectoria del saldo
 * mientras se hace scroll de las secciones.
 */
export function GridBalanceRow({
  buckets,
  balanceByBucket,
  currentIdx,
}: {
  buckets: ProjectionBucket[];
  /** bucketKey → saldo acumulado proyectado (cumulativeBalances). */
  balanceByBucket: Map<string, number>;
  currentIdx: number;
}) {
  return (
    <tr className="sticky bottom-0 z-10 border-t-2 border-ds-border-strong bg-ds-surface-2 font-semibold">
      <td className="sticky left-0 z-20 border-r border-ds-border-default bg-ds-surface-2 p-2 text-[12px] font-semibold text-ds-text-1">
        FC · saldo acumulado
      </td>
      {buckets.map((b, i) => {
        const bal = balanceByBucket.get(b.key);
        const hasBal = bal !== undefined;
        const negative = hasBal && bal < 0;
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
            )}
          >
            {hasBal ? fmt.format(bal) : "·"}
          </td>
        );
      })}
    </tr>
  );
}
