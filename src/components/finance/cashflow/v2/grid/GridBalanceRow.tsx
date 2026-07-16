"use client";

import { Anchor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type { BucketMeta } from "./grid-helpers";
import { PendingColumnPulse } from "./PendingColumnPulse";

/**
 * Fila FC — saldo acumulado proyectado por semana (verde ≥ 0, rojo < 0).
 * Sticky bottom para leer la trayectoria mientras se hace scroll.
 */
export function GridBalanceRow({
  buckets,
  balanceByBucket,
  currentIdx,
  bucketMeta,
  pendingKeys,
}: {
  buckets: ProjectionBucket[];
  balanceByBucket: Map<string, number>;
  currentIdx: number;
  bucketMeta?: Map<string, BucketMeta>;
  pendingKeys?: Set<string>;
}) {
  return (
    <tr className="sticky bottom-0 z-10 border-t-2 border-ds-border-strong bg-ds-surface-2 font-semibold">
      <td className="sticky left-0 z-20 max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-2 p-2 text-[12px] font-semibold text-ds-text-1">
        FC · saldo acumulado
      </td>
      {buckets.map((b, i) => {
        if (pendingKeys?.has(b.key)) {
          return (
            <td
              key={b.key}
              className={cn(
                "border-l border-ds-border-subtle bg-ds-surface-2 px-1.5 py-2",
                i === currentIdx && "bg-primary/[0.06]",
              )}
            >
              <PendingColumnPulse />
            </td>
          );
        }
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
