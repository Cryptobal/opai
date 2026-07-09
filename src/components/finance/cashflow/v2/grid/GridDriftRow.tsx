"use client";

import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import {
  fmt,
  driftTone,
  DRIFT_TONE_CLASS,
} from "@/components/finance/cashflow/MatrixHelpers";
import type { BucketMeta } from "./grid-helpers";

/**
 * Fila de drift acumulado (banco real − proyectado) por semana. Parte de la
 * información "avanzada": solo se muestra con el modo avanzado activo, para que
 * la vista diaria quede limpia. Tono según la magnitud del drift (ok/info/warn)
 * reutilizando los helpers de la matriz legacy. "·" en semanas futuras (sin
 * saldo bancario real todavía).
 */
export function GridDriftRow({
  buckets,
  driftByBucket,
  currentIdx,
  bucketMeta,
}: {
  buckets: ProjectionBucket[];
  /** bucketKey → drift acumulado (cumulativeBankVarianceClp); null = futuro. */
  driftByBucket: Map<string, number | null>;
  currentIdx: number;
  bucketMeta?: Map<string, BucketMeta>;
}) {
  return (
    <tr className="border-t border-ds-border-default bg-ds-surface-1">
      <td className="sticky left-0 z-10 border-r border-ds-border-default bg-ds-surface-1 p-2 text-[12px] text-ds-text-2">
        Drift acumulado
      </td>
      {buckets.map((b, i) => {
        const drift = driftByBucket.get(b.key) ?? null;
        const meta = bucketMeta?.get(b.key);
        return (
          <td
            key={b.key}
            className={cn(
              "border-l border-ds-border-subtle px-1.5 py-1.5 text-center font-mono text-[12px] tabular-nums",
              DRIFT_TONE_CLASS[driftTone(drift)],
              i === currentIdx && "bg-primary/[0.04]",
              meta?.closed && "opacity-70",
              meta?.anchor && "border-r-2 border-r-primary",
            )}
          >
            {drift === null
              ? "·"
              : Math.abs(drift) < 50_000
                ? "✓"
                : `${drift > 0 ? "+" : ""}${fmt.format(drift)}`}
          </td>
        );
      })}
    </tr>
  );
}
