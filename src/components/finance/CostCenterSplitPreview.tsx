"use client";

import { Input } from "@/components/ui/input";
import type { CostAllocationDriver } from "@/modules/finance/banking/cost-allocation-math";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export type SplitPreviewRow = {
  installationId: string;
  name: string;
  accountName: string | null;
  guards: number | null;
  pct: number;
  amount: number;
};

export function CostCenterSplitPreview({
  rows,
  driver,
  onAmountChange,
}: {
  rows: SplitPreviewRow[];
  driver: CostAllocationDriver;
  onAmountChange?: (installationId: string, amount: number) => void;
}) {
  if (rows.length === 0) return null;
  const manual = driver === "MANUAL" && onAmountChange;

  return (
    <>
      <div className="hidden sm:block overflow-x-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-ds-text-3">
              <th className="py-1.5 font-medium">Instalación</th>
              <th className="py-1.5 font-medium">Cliente</th>
              <th className="py-1.5 font-medium text-right">Guardias</th>
              <th className="py-1.5 font-medium text-right">%</th>
              <th className="py-1.5 font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.installationId} className="border-t border-ds-border-subtle">
                <td className="py-2 pr-2 text-ds-text-1 truncate max-w-[140px]">
                  {r.name}
                </td>
                <td className="py-2 pr-2 text-ds-text-3 truncate max-w-[120px]">
                  {r.accountName ?? "—"}
                </td>
                <td className="py-2 text-right font-mono text-ds-text-2">
                  {r.guards == null ? "—" : r.guards}
                </td>
                <td className="py-2 text-right font-mono text-ds-text-2">
                  {(r.pct * 100).toFixed(1)}%
                </td>
                <td className="py-2 text-right">
                  {manual ? (
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-10 sm:h-9 w-[7.5rem] ml-auto text-right font-mono"
                      value={r.amount}
                      onChange={(e) =>
                        onAmountChange(r.installationId, Number(e.target.value) || 0)
                      }
                    />
                  ) : (
                    <span className="font-mono">{fmtCLP.format(r.amount)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="sm:hidden space-y-2">
        {rows.map((r) => (
          <li
            key={r.installationId}
            className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 space-y-1"
          >
            <p className="text-[13px] font-medium text-ds-text-1">{r.name}</p>
            <p className="text-[12px] text-ds-text-3">
              {r.accountName ?? "Sin cliente"}
              {r.guards != null ? ` · ${r.guards} guardias` : ""}
              {` · ${(r.pct * 100).toFixed(1)}%`}
            </p>
            {manual ? (
              <Input
                type="number"
                inputMode="numeric"
                className="h-10 font-mono"
                value={r.amount}
                onChange={(e) =>
                  onAmountChange(r.installationId, Number(e.target.value) || 0)
                }
              />
            ) : (
              <p className="font-mono text-[13px] text-ds-text-1">
                {fmtCLP.format(r.amount)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
