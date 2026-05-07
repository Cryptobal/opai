"use client";

import { useState, useTransition } from "react";
import type {
  FinanceReportPeriod,
  LedgerResult,
} from "@/modules/finance/reports/shared/types";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";
import { KPICard } from "./shared/KPICard";

interface Props {
  accountId: string;
  initialPeriod: FinanceReportPeriod;
  initialData: LedgerResult;
}

const fmtCLP = (n: number): string =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtCompact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return fmtCLP(n);
};

export function AccountDrillClient({ accountId, initialPeriod, initialData }: Props) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [, startTransition] = useTransition();

  const refetch = (p: FinanceReportPeriod) => {
    setPeriod(p);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, period: p, filters: {} }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReportsPeriodPicker value={period} onChange={refetch} />
        <ExportMenu
          endpoint="/api/finance/reports/ledger/export"
          payload={{ accountId, period, filters: {} }}
          filenameBase={`mayor-${data.account.code}-${period.from}-${period.to}`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Saldo inicial"
          value={fmtCompact(data.openingBalance)}
          tone="violet"
        />
        <KPICard label="Total débitos" value={fmtCompact(data.totalDebit)} tone="emerald" />
        <KPICard label="Total créditos" value={fmtCompact(data.totalCredit)} tone="rose" />
        <KPICard
          label="Saldo final"
          value={fmtCompact(data.closingBalance)}
          tone={data.closingBalance >= 0 ? "emerald" : "rose"}
          sub={`${data.entries.length} mov.`}
        />
      </div>

      <div
        className="rounded-xl border bg-ds-surface overflow-hidden"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 900 }}>
            <thead className="sticky top-0" style={{ background: "var(--ds-bg-2)" }}>
              <tr>
                <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-24">
                  Fecha
                </th>
                <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-12">
                  N°
                </th>
                <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                  Descripción
                </th>
                <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-24">
                  Ref
                </th>
                <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-32">
                  CC
                </th>
                <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-28">
                  Debe
                </th>
                <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-28">
                  Haber
                </th>
                <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-32">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t italic text-ds-text-3"
                style={{ borderColor: "var(--ds-border-soft)" }}>
                <td colSpan={7} className="px-3 py-2 text-right">
                  Saldo inicial
                </td>
                <td className="px-3 py-2 text-right">{fmtCLP(data.openingBalance)}</td>
              </tr>
              {data.entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-ds-text-3"
                  >
                    Sin movimientos en el período.
                  </td>
                </tr>
              ) : (
                data.entries.map((e, i) => (
                  <tr
                    key={i}
                    className="border-t"
                    style={{ borderColor: "var(--ds-border-soft)" }}
                  >
                    <td className="px-3 py-2 text-ds-text-2">{e.date}</td>
                    <td className="px-3 py-2 text-right text-ds-text-3 font-mono">
                      {e.entryNumber}
                    </td>
                    <td className="px-3 py-2 text-ds-text-1">{e.description}</td>
                    <td className="px-3 py-2 text-ds-text-3 font-mono text-[11px]">
                      {e.reference ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-ds-text-3 truncate">
                      {e.costCenterName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-500">
                      {e.debit ? fmtCLP(e.debit) : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-500">
                      {e.credit ? fmtCLP(e.credit) : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-ds-text-1">
                      {fmtCLP(e.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--ds-bg-2)" }} className="border-t font-semibold">
                <td colSpan={5} className="px-3 py-2 text-ds-text-1">
                  Total
                </td>
                <td className="px-3 py-2 text-right text-emerald-500">
                  {fmtCLP(data.totalDebit)}
                </td>
                <td className="px-3 py-2 text-right text-rose-500">
                  {fmtCLP(data.totalCredit)}
                </td>
                <td className="px-3 py-2 text-right text-ds-text-1">
                  {fmtCLP(data.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
