"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Receipt,
  Wallet,
} from "lucide-react";
import type {
  FinanceReportPeriod,
  ProfitabilityResult,
  ProfitabilityRow,
} from "@/modules/finance/reports/shared/types";
import {
  KPICard,
  KPIGrid,
  Surface,
  EmptyState,
  DataTable,
  type DataTableColumn,
} from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: ProfitabilityResult;
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

const METHODS = [
  { id: "by_revenue" as const, label: "Por ingresos" },
  { id: "by_invoices_count" as const, label: "Por # facturas" },
  { id: "none" as const, label: "Sin opex" },
];

interface IndexedRow extends ProfitabilityRow {
  index: number;
  maxAbsMargin: number;
}

export function ProfitabilityClient({ initialPeriod, initialData }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [method, setMethod] = useState(initialData.opexAllocationMethod);
  const [isPending, startTransition] = useTransition();

  const refetch = (
    p: FinanceReportPeriod,
    m: ProfitabilityResult["opexAllocationMethod"]
  ) => {
    setPeriod(p);
    setMethod(m);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/profitability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: p, filters: {}, opexAllocationMethod: m }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  const negativeCount = useMemo(
    () => data.rows.filter((r) => r.margin < 0).length,
    [data.rows]
  );
  const maxAbsMargin = useMemo(
    () => Math.max(...data.rows.map((r) => Math.abs(r.margin)), 1),
    [data.rows]
  );

  const indexedRows: IndexedRow[] = useMemo(
    () => data.rows.map((r, i) => ({ ...r, index: i, maxAbsMargin })),
    [data.rows, maxAbsMargin]
  );

  const columns: DataTableColumn<IndexedRow>[] = useMemo(
    () => [
      {
        id: "rank",
        header: "#",
        align: "left",
        width: "w-12",
        cell: (r) => <span className="text-ds-text-3">{r.index + 1}</span>,
      },
      {
        id: "client",
        header: "Cliente",
        align: "left",
        cell: (r) => (
          <div>
            <p className="text-ds-text-1">{r.clientName}</p>
            {r.sector && <p className="text-[10.5px] text-ds-text-4">{r.sector}</p>}
          </div>
        ),
      },
      {
        id: "revenue",
        header: "Ventas",
        align: "right",
        cell: (r) => <span title={fmtCLP(r.revenue)}>{fmtCLPShort(r.revenue)}</span>,
      },
      {
        id: "cost",
        header: "Costo",
        align: "right",
        cell: (r) => <span title={fmtCLP(r.directCost)}>{fmtCLPShort(r.directCost)}</span>,
      },
      {
        id: "opex",
        header: "Opex",
        align: "right",
        hideOnMobile: true,
        cell: (r) => <span title={fmtCLP(r.allocatedOpex)}>{fmtCLPShort(r.allocatedOpex)}</span>,
      },
      {
        id: "margin",
        header: "Margen",
        align: "right",
        cell: (r) => (
          <span
            title={fmtCLP(r.margin)}
            className={cn(
              "font-semibold",
              r.margin >= 0 ? "text-status-ok-fg" : "text-status-danger-fg"
            )}
          >
            {fmtCLPShort(r.margin)}
          </span>
        ),
      },
      {
        id: "marginPct",
        header: "%",
        align: "left",
        width: "w-40",
        cell: (r) => {
          const pct = (Math.abs(r.margin) / r.maxAbsMargin) * 100;
          const tone = r.margin >= 0 ? "bg-status-ok" : "bg-status-danger";
          const fg = r.margin >= 0 ? "text-status-ok-fg" : "text-status-danger-fg";
          return (
            <div className="flex items-center gap-2">
              <span className={cn("text-xs ds-num w-14 shrink-0", fg)}>
                {r.marginPct.toFixed(1)}%
              </span>
              <div className="h-1.5 flex-1 rounded-full overflow-hidden bg-ds-surface-3">
                <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className={cn("space-y-5", isPending && "opacity-70")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ReportsPeriodPicker value={period} onChange={(p) => refetch(p, method)} />
          <div className="inline-flex rounded-ds-md border border-ds-border-default overflow-hidden">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => refetch(period, m.id)}
                className={cn(
                  "h-9 px-3 text-sm transition-colors",
                  method === m.id
                    ? "bg-tint-amber/15 text-tint-amber-fg"
                    : "bg-ds-surface text-ds-text-2 hover:bg-ds-surface-2"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ExportMenu
          endpoint="/api/finance/reports/profitability/export"
          payload={{ period, filters: {}, opexAllocationMethod: method }}
          filenameBase={`rentabilidad-${period.from}-${period.to}`}
        />
      </div>

      <KPIGrid>
        <KPICard
          label="Ingresos totales"
          value={
            <span title={fmtCLP(data.totals.revenue)}>{fmtCLPShort(data.totals.revenue)}</span>
          }
          icon={DollarSign}
          iconTone="emerald"
          variant="brand"
        />
        <KPICard
          label="Costo directo"
          value={
            <span title={fmtCLP(data.totals.directCost)}>
              {fmtCLPShort(data.totals.directCost)}
            </span>
          }
          icon={Receipt}
          iconTone="rose"
        />
        <KPICard
          label="Opex prorrateado"
          value={
            <span title={fmtCLP(data.totals.allocatedOpex)}>
              {fmtCLPShort(data.totals.allocatedOpex)}
            </span>
          }
          icon={Wallet}
          iconTone="amber"
        />
        <KPICard
          label="Margen total"
          value={
            <span title={fmtCLP(data.totals.margin)}>{fmtCLPShort(data.totals.margin)}</span>
          }
          hint={`${data.totals.marginPct.toFixed(1)}%`}
          icon={TrendingUp}
          iconTone={data.totals.margin >= 0 ? "emerald" : "rose"}
          variant={data.totals.margin >= 0 ? "ok" : "danger"}
        />
      </KPIGrid>

      {negativeCount >= 3 && (
        <Surface accent="warn" padding="md" className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-status-warn-fg shrink-0" />
          <span className="text-sm">
            <strong>{negativeCount} clientes</strong> con margen negativo en este período. Revisar
            pricing o costos directos.
          </span>
        </Surface>
      )}

      {data.rows.length === 0 ? (
        <Surface padding="lg">
          <EmptyState
            icon={TrendingUp}
            title="Sin datos para el período"
            description="No hay ventas/compras suficientes para calcular rentabilidad."
          />
        </Surface>
      ) : (
        <DataTable
          columns={columns}
          rows={indexedRows}
          rowKey={(r) => r.crmAccountId}
          rowVariant={(r) => (r.margin < 0 ? "danger" : "default")}
          onRowClick={(r) => {
            if (r.crmAccountId.startsWith("__") || r.crmAccountId.startsWith("rut:")) return;
            router.push(`/finanzas/reportes/ventas/${r.crmAccountId}`);
          }}
        />
      )}
    </div>
  );
}
