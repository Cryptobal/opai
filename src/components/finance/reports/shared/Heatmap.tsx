"use client";

import { useMemo } from "react";
import type {
  FinanceMatrixResult,
  FinanceMatrixRow,
} from "@/modules/finance/reports/shared/types";
import { splitMonths } from "@/modules/finance/reports/shared/period.helper";

interface Props {
  data: FinanceMatrixResult;
  accent?: string;
  onCellClick?: (row: FinanceMatrixRow, monthIdx: number) => void;
  onRowClick?: (row: FinanceMatrixRow) => void;
  fmt?: (n: number) => string;
}

const defaultFmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};

export function Heatmap({
  data,
  accent = "#10B981",
  onCellClick,
  onRowClick,
  fmt = defaultFmt,
}: Props) {
  const months = useMemo(() => splitMonths(data.period), [data.period]);
  const max = useMemo(
    () => Math.max(...data.rows.flatMap((r) => r.monthly), 1),
    [data.rows]
  );

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-ds-text-3" style={{ borderColor: "var(--ds-border)" }}>
        Sin datos para los filtros aplicados.
      </div>
    );
  }

  const intensity = (v: number): number => (v <= 0 ? 0 : Math.max(0.08, Math.min(1, v / max)));

  return (
    <div
      className="rounded-xl border bg-ds-surface overflow-hidden"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] tabular-nums" style={{ minWidth: 120 + months.length * 90 }}>
          <thead>
            <tr style={{ background: "var(--ds-bg-2)" }}>
              <th
                className="sticky left-0 px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3"
                style={{ background: "var(--ds-bg-2)", minWidth: 200 }}
              >
                Cliente
              </th>
              {months.map((m) => (
                <th
                  key={m.key}
                  className="px-2 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3"
                  style={{ minWidth: 80 }}
                >
                  {m.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t" style={{ borderColor: "var(--ds-border-soft)" }}>
                <td
                  className="sticky left-0 px-3 py-2 text-ds-text-1 cursor-pointer hover:underline"
                  style={{ background: "var(--ds-surface)" }}
                  onClick={() => onRowClick?.(row)}
                >
                  <div className="flex items-center gap-2">
                    {row.color && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: row.color }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate">{row.label}</p>
                      {row.sublabel && (
                        <p className="text-[10px] text-ds-text-4 truncate">{row.sublabel}</p>
                      )}
                    </div>
                  </div>
                </td>
                {row.monthly.map((v, i) => {
                  const i01 = intensity(v);
                  return (
                    <td
                      key={i}
                      onClick={() => v !== 0 && onCellClick?.(row, i)}
                      className="px-2 py-2 text-right text-ds-text-1 cursor-pointer transition-opacity"
                      style={{
                        background:
                          v === 0
                            ? "transparent"
                            : `color-mix(in oklab, ${accent} ${(i01 * 100).toFixed(0)}%, transparent)`,
                      }}
                    >
                      {v ? fmt(v) : ""}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-ds-text-1 font-semibold">
                  {fmt(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--ds-bg-2)" }} className="border-t" >
              <td
                className="sticky left-0 px-3 py-2 font-semibold text-ds-text-1"
                style={{ background: "var(--ds-bg-2)" }}
              >
                Total
              </td>
              {data.totalsByMonth.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right font-semibold text-ds-text-1">
                  {fmt(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold text-ds-text-1">
                {fmt(data.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
