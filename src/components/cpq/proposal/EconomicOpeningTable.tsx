"use client";

import { Tag } from "@/components/opai-ds";
import {
  ECONOMIC_OPENING_NOTE,
  formatOpeningClp,
  formatOpeningPct,
  formatOpeningUf,
  openingAmountColumns,
  type EconomicOpening,
} from "@/lib/cpq/economic-opening";

export function EconomicOpeningTable({ opening }: { opening: EconomicOpening }) {
  const [primary, secondary] = openingAmountColumns(opening.currency);
  const fmt = (kind: "uf" | "clp", clp: number) =>
    kind === "uf" ? formatOpeningUf(clp, opening.ufValue) : formatOpeningClp(clp);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
        <table className="w-full min-w-[20rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-[12px] text-ds-text-3">
              <th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 font-medium text-right">{primary === "uf" ? "UF" : "CLP"}</th>
              <th className="px-3 py-2 font-medium text-right">{secondary === "uf" ? "UF" : "CLP"}</th>
              <th className="px-3 py-2 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {opening.rows.map((row) => (
              <tr
                key={row.key}
                className={
                  row.highlight
                    ? "border-t border-ds-border-default bg-status-ok-soft font-semibold text-ds-text-1"
                    : "border-t border-ds-border-subtle text-ds-text-1"
                }
              >
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono text-[12px]">{fmt(primary, row.amountClp)}</td>
                <td className="px-3 py-2 text-right font-mono text-[12px] text-ds-text-3">
                  {fmt(secondary, row.amountClp)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[12px]">{formatOpeningPct(row.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ds-text-3">{opening.note}</p>
      <Tag variant="info" size="sm">
        Auto · siempre al día
      </Tag>
    </div>
  );
}
