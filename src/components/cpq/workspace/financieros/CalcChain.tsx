"use client";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";

export type CalcChainRow = {
  label: string;
  detail?: string;
  amount?: number;
  highlight?: boolean;
  text?: string;
};

/** Cadena de cálculo anclada al pie de cada bloque financiero. */
export function CalcChain({
  rows,
  totalLabel = "Aporte al precio",
  total,
}: {
  rows: CalcChainRow[];
  totalLabel?: string;
  total: number;
}) {
  return (
    <div className="mt-auto space-y-1 border-t border-ds-border-subtle pt-2 font-mono text-[12px]">
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className={cn(
            "flex items-baseline justify-between gap-2",
            row.highlight && "rounded bg-status-warn-soft/40 px-1 py-0.5",
          )}
        >
          <span className="min-w-0 text-ds-text-3">
            <span className="font-sans text-ds-text-2">{row.label}</span>
            {row.detail ? (
              <span className="ml-1 text-ds-text-4">{row.detail}</span>
            ) : null}
          </span>
          <span
            className={cn(
              "shrink-0 tabular-nums",
              row.highlight ? "font-semibold text-status-warn-fg" : "text-ds-text-2",
            )}
          >
            {row.text ?? (row.amount != null ? formatCurrency(row.amount) : "—")}
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-ds-border-subtle pt-1.5">
        <span className="font-sans text-[13px] font-semibold text-foreground">
          {totalLabel}
        </span>
        <span className="tabular-nums text-[13px] font-semibold text-status-ok-fg">
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}
