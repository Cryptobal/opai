"use client";

/**
 * Comparador de instalaciones incluidas (≥2): métricas × instalación con los
 * mejores valores destacados. Solo lectura — deriva de las hijas.
 */

import { useMemo } from "react";
import { Surface, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";
import { fmtBundleMoney, memberMonthlyClp } from "./bundle-billing";

type MetricKey = "monthly" | "guards" | "positions" | "margin" | "costPerGuard";

type Row = {
  key: MetricKey;
  label: string;
  /** Mejor = mayor o menor según la métrica. */
  best: "max" | "min";
  format: (value: number) => string;
};

export function ComparadorSection({
  bundle,
  ufValue,
}: {
  bundle: BundleDetail;
  ufValue: number | null;
}) {
  const cols = useMemo(
    () =>
      bundle.quotes
        .filter((m) => m.includedInProposal)
        .map((m) => {
          const monthly = memberMonthlyClp(m);
          const guards = m.quote.totalGuards || 0;
          return {
            quoteId: m.quoteId,
            label: m.quote.installation?.name || m.quote.code,
            values: {
              monthly,
              guards,
              positions: m.quote.totalPositions || 0,
              margin:
                m.quote.parameters?.marginPct != null
                  ? Number(m.quote.parameters.marginPct)
                  : 0,
              costPerGuard: guards > 0 ? monthly / guards : 0,
            } as Record<MetricKey, number>,
          };
        }),
    [bundle],
  );

  if (cols.length < 2) return null;

  const money = (v: number) => fmtBundleMoney(v, bundle.currency, ufValue);
  const rows: Row[] = [
    { key: "monthly", label: "Mensual", best: "max", format: money },
    { key: "guards", label: "Dotación", best: "max", format: (v) => String(Math.round(v)) },
    { key: "positions", label: "Puestos", best: "max", format: (v) => String(Math.round(v)) },
    { key: "margin", label: "Margen", best: "max", format: (v) => `${v.toFixed(1)}%` },
    { key: "costPerGuard", label: "Mensual / guardia", best: "min", format: money },
  ];

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-comparador">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base text-foreground">Comparador</h2>
        <Tag variant="neutral" size="sm">{cols.length} instalaciones incluidas</Tag>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-[13px]">
          <thead>
            <tr className="border-b border-ds-border-subtle text-left text-ds-text-3">
              <th className="py-2 pr-3 font-medium">Métrica</th>
              {cols.map((c) => (
                <th key={c.quoteId} className="py-2 pr-3 font-medium">
                  <span className="block max-w-[10rem] truncate" title={c.label}>
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = cols.map((c) => c.values[row.key]);
              const usable = values.filter((v) => v > 0);
              const bestValue = usable.length
                ? row.best === "max"
                  ? Math.max(...usable)
                  : Math.min(...usable)
                : null;
              return (
                <tr key={row.key} className="border-b border-ds-border-subtle/60">
                  <td className="py-2 pr-3 text-ds-text-2">{row.label}</td>
                  {cols.map((c) => {
                    const v = c.values[row.key];
                    const isBest = bestValue != null && v === bestValue && v > 0;
                    return (
                      <td
                        key={c.quoteId}
                        className={cn(
                          "py-2 pr-3 font-mono tabular-nums",
                          isBest
                            ? "font-bold text-status-ok-fg"
                            : "text-foreground",
                        )}
                      >
                        {row.format(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ds-text-3">
        Se destaca el mejor valor de cada métrica entre las instalaciones incluidas.
      </p>
    </Surface>
  );
}
