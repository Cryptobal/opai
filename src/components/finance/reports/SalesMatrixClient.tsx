"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type {
  FinanceMatrixResult,
  FinanceReportFilters,
  FinanceReportPeriod,
} from "@/modules/finance/reports/shared/types";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";
import { ReportsFiltersDrawer } from "./ReportsFiltersDrawer";
import { Heatmap } from "./shared/Heatmap";
import { KPICard } from "./shared/KPICard";
import { EmptyReport } from "./shared/EmptyReport";
import { Grid3x3 } from "lucide-react";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: FinanceMatrixResult;
  /** Endpoint para fetch — default ventas; se reusa en compras. */
  endpoint?: string;
  exportEndpoint?: string;
  /** Color base para celdas. */
  accent?: string;
  /** Ruta del drill-down de cliente. */
  drilldownBase?: string;
  filenameBase?: string;
}

const fmtCompact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
};

export function SalesMatrixClient({
  initialPeriod,
  initialData,
  endpoint = "/api/finance/reports/sales-matrix",
  exportEndpoint = "/api/finance/reports/sales-matrix/export",
  accent = "#10B981",
  drilldownBase = "/finanzas/reportes/ventas",
  filenameBase = "ventas",
}: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<FinanceReportFilters>({});
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();

  const refetch = (p: FinanceReportPeriod, f: FinanceReportFilters) => {
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: p, filters: f }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const r of data.rows) {
      const sec = r.meta?.sector as string | undefined;
      if (sec) s.add(sec);
    }
    return Array.from(s).sort();
  }, [data.rows]);

  const filteredData = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return {
      ...data,
      rows: data.rows.filter((r) => r.label.toLowerCase().includes(q)),
    };
  }, [data, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReportsPeriodPicker
          value={period}
          onChange={(p) => {
            setPeriod(p);
            refetch(p, filters);
          }}
        />
        <div className="flex items-center gap-2">
          <ReportsFiltersDrawer
            value={filters}
            onChange={(f) => {
              setFilters(f);
              refetch(period, f);
            }}
            sectorOptions={sectors}
          />
          <ExportMenu
            endpoint={exportEndpoint}
            payload={{ period, filters }}
            filenameBase={`${filenameBase}-${period.from}-${period.to}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Facturación total"
          value={fmtCompact(data.grandTotal)}
          tone="emerald"
        />
        <KPICard label="Clientes" value={`${data.rows.length}`} tone="violet" />
        <KPICard label="DTEs" value={`${data.documentsCount}`} tone="sky" />
        <KPICard
          label="Ticket promedio"
          value={fmtCompact(
            data.documentsCount > 0 ? data.grandTotal / data.documentsCount : 0
          )}
          tone="amber"
        />
      </div>

      <div
        className="flex items-center gap-2 rounded-lg border bg-ds-surface px-3 h-10"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <Search className="w-3.5 h-3.5 text-ds-text-3" />
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-[12.5px] text-ds-text-1 placeholder:text-ds-text-4 focus:outline-none"
        />
      </div>

      {filteredData.rows.length === 0 ? (
        <EmptyReport
          icon={Grid3x3}
          title="Sin datos para los filtros aplicados"
          description="Probá ampliar el período o limpiar los filtros."
        />
      ) : (
        <Heatmap
          data={filteredData}
          accent={accent}
          fmt={fmtCompact}
          onRowClick={(row) => {
            if (row.id !== "__no_client__") router.push(`${drilldownBase}/${row.id}`);
          }}
        />
      )}
    </div>
  );
}
