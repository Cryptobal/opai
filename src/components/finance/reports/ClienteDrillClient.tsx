"use client";

import Link from "next/link";
import { DollarSign, TrendingUp, Receipt, Building2, ExternalLink } from "lucide-react";
import type {
  FinanceMatrixResult,
  FinanceReportPeriod,
} from "@/modules/finance/reports/shared/types";
import { splitMonths } from "@/modules/finance/reports/shared/period.helper";
import { KPICard } from "./shared/KPICard";

interface Props {
  accountId: string;
  accountName: string;
  installations: Array<{ id: string; name: string }>;
  sales: FinanceMatrixResult;
  purchases: FinanceMatrixResult;
  initialPeriod: FinanceReportPeriod;
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

export function ClienteDrillClient({
  accountId,
  installations,
  sales,
  purchases,
  initialPeriod,
}: Props) {
  const months = splitMonths(initialPeriod);
  const salesByMonth = sales.totalsByMonth;
  const max = Math.max(...salesByMonth, 1);
  const margin = sales.grandTotal - purchases.grandTotal;
  const marginPct =
    sales.grandTotal > 0 ? (margin / sales.grandTotal) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Facturación YTD"
          value={fmtCompact(sales.grandTotal)}
          icon={DollarSign}
          tone="emerald"
        />
        <KPICard
          label="Compras (costo)"
          value={fmtCompact(purchases.grandTotal)}
          icon={Receipt}
          tone="rose"
        />
        <KPICard
          label="Margen"
          value={fmtCompact(margin)}
          icon={TrendingUp}
          tone={margin >= 0 ? "emerald" : "rose"}
          sub={`${marginPct.toFixed(1)}%`}
        />
        <KPICard
          label="Instalaciones"
          value={`${installations.length}`}
          icon={Building2}
          tone="sky"
        />
      </div>

      <section
        className="rounded-xl border bg-ds-surface p-4 md:p-5"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <header className="flex items-center justify-between mb-3">
          <h3
            className="text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Facturación mensual · {initialPeriod.label}
          </h3>
          <Link
            href={`/finanzas/facturacion?crmAccountId=${accountId}`}
            className="inline-flex items-center gap-1 text-[11.5px] font-mono uppercase tracking-wider text-ds-text-3 hover:text-ds-text-1"
          >
            Ver DTEs <ExternalLink className="w-3 h-3" />
          </Link>
        </header>
        <div className="flex items-end gap-1 h-32">
          {months.map((m, i) => {
            const v = salesByMonth[i] ?? 0;
            const h = max > 0 ? (v / max) * 100 : 0;
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[9px] font-mono text-ds-text-4">
                  {v ? fmtCompact(v) : ""}
                </span>
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    minHeight: v ? 2 : 0,
                    background: "var(--ds-tint-emerald)",
                  }}
                />
                <span className="text-[10px] text-ds-text-3">{m.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="rounded-xl border bg-ds-surface p-4 md:p-5"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <header className="flex items-center justify-between mb-3">
          <h3
            className="text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Instalaciones ({installations.length})
          </h3>
        </header>
        {installations.length === 0 ? (
          <p className="text-[12px] text-ds-text-3">
            Sin instalaciones asociadas a este cliente.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--ds-border-soft)" }}>
            {installations.map((inst) => (
              <li
                key={inst.id}
                className="py-2 flex items-center justify-between text-[12.5px]"
              >
                <span className="text-ds-text-1">{inst.name}</span>
                <Link
                  href={`/crm/installations/${inst.id}`}
                  className="text-ds-text-3 hover:text-ds-text-1 inline-flex items-center gap-1 text-[11px]"
                >
                  Abrir <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
