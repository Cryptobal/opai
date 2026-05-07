"use client";

import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Building2,
  ExternalLink,
} from "lucide-react";
import type {
  FinanceMatrixResult,
  FinanceReportPeriod,
} from "@/modules/finance/reports/shared/types";
import { splitMonths } from "@/modules/finance/reports/shared/period.helper";
import {
  KPICard,
  KPIGrid,
  Surface,
  SectionHeader,
  EmptyState,
} from "@/components/opai-ds";

interface Props {
  accountId: string;
  accountName: string;
  installations: Array<{ id: string; name: string }>;
  sales: FinanceMatrixResult;
  purchases: FinanceMatrixResult;
  initialPeriod: FinanceReportPeriod;
}

const fmtCLP = (n: number): string =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}MM`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
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
      <KPIGrid>
        <KPICard
          label="Facturación YTD"
          value={
            <span title={fmtCLP(sales.grandTotal)}>{fmtCLPShort(sales.grandTotal)}</span>
          }
          icon={DollarSign}
          iconTone="emerald"
          variant="brand"
        />
        <KPICard
          label="Compras (costo)"
          value={
            <span title={fmtCLP(purchases.grandTotal)}>
              {fmtCLPShort(purchases.grandTotal)}
            </span>
          }
          icon={Receipt}
          iconTone="rose"
        />
        <KPICard
          label="Margen"
          value={<span title={fmtCLP(margin)}>{fmtCLPShort(margin)}</span>}
          hint={`${marginPct.toFixed(1)}%`}
          icon={TrendingUp}
          iconTone={margin >= 0 ? "emerald" : "rose"}
          variant={margin >= 0 ? "ok" : "danger"}
        />
        <KPICard
          label="Instalaciones"
          value={installations.length}
          icon={Building2}
          iconTone="sky"
        />
      </KPIGrid>

      <Surface padding="lg" elevation={1}>
        <SectionHeader
          title={`Facturación mensual · ${initialPeriod.label}`}
          size="md"
          actions={
            <Link
              href={`/finanzas/facturacion?crmAccountId=${accountId}`}
              className="inline-flex items-center gap-1 text-xs text-ds-text-3 hover:text-ds-text-1 font-mono uppercase tracking-wider"
            >
              Ver DTEs <ExternalLink className="w-3 h-3" />
            </Link>
          }
        />
        <div className="flex items-end gap-1 h-32 mt-3">
          {months.map((m, i) => {
            const v = salesByMonth[i] ?? 0;
            const h = max > 0 ? (v / max) * 100 : 0;
            return (
              <div
                key={m.key}
                className="flex-1 flex flex-col items-center justify-end gap-1"
              >
                <span className="text-[9px] font-mono text-ds-text-4">
                  {v ? fmtCLPShort(v) : ""}
                </span>
                <div
                  className="w-full rounded-t-sm bg-tint-emerald"
                  style={{
                    height: `${h}%`,
                    minHeight: v ? 2 : 0,
                  }}
                  title={v ? fmtCLP(v) : ""}
                />
                <span className="text-[10px] text-ds-text-3">{m.label}</span>
              </div>
            );
          })}
        </div>
      </Surface>

      <Surface padding="lg" elevation={1}>
        <SectionHeader title={`Instalaciones (${installations.length})`} size="md" />
        {installations.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={Building2}
              title="Sin instalaciones asociadas"
              description="Este cliente aún no tiene instalaciones vinculadas en el CRM."
              compact
            />
          </div>
        ) : (
          <ul className="divide-y divide-ds-border-subtle mt-3">
            {installations.map((inst) => (
              <li
                key={inst.id}
                className="py-2 flex items-center justify-between text-sm"
              >
                <span className="text-ds-text-1">{inst.name}</span>
                <Link
                  href={`/crm/installations/${inst.id}`}
                  className="text-ds-text-3 hover:text-ds-text-1 inline-flex items-center gap-1 text-xs"
                >
                  Abrir <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
