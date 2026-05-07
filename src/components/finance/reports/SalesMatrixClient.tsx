"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Grid3x3 } from "lucide-react";
import type {
  FinanceMatrixResult,
  FinanceReportFilters,
  FinanceReportPeriod,
} from "@/modules/finance/reports/shared/types";
import {
  KPICard,
  KPIGrid,
  Surface,
  Toolbar,
  EmptyState,
} from "@/components/opai-ds";
import { splitMonths } from "@/modules/finance/reports/shared/period.helper";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";
import { ReportsFiltersDrawer } from "./ReportsFiltersDrawer";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: FinanceMatrixResult;
  endpoint?: string;
  exportEndpoint?: string;
  /** Tone semántico del DS para las celdas pintadas. */
  tone?: "emerald" | "rose";
  drilldownBase?: string;
  filenameBase?: string;
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

const TONE_CSS_VAR: Record<NonNullable<Props["tone"]>, string> = {
  emerald: "var(--tint-emerald)",
  rose: "var(--tint-rose)",
};

export function SalesMatrixClient({
  initialPeriod,
  initialData,
  endpoint = "/api/finance/reports/sales-matrix",
  exportEndpoint = "/api/finance/reports/sales-matrix/export",
  tone = "emerald",
  drilldownBase = "/finanzas/reportes/ventas",
  filenameBase = "ventas",
}: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<FinanceReportFilters>({});
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

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

  const months = useMemo(() => splitMonths(period), [period]);
  const filteredRows = useMemo(() => {
    if (!search) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [data.rows, search]);

  const max = useMemo(
    () => Math.max(...data.rows.flatMap((r) => r.monthly), 1),
    [data.rows]
  );
  const intensity = (v: number): number =>
    v <= 0 ? 0 : Math.max(0.08, Math.min(1, v / max));

  const colorForRow = (rowId: string): string => {
    if (rowId.startsWith("__") || rowId.startsWith("rut:")) {
      return TONE_CSS_VAR[tone];
    }
    return TONE_CSS_VAR[tone];
  };

  const handleRowClick = (rowId: string) => {
    if (rowId.startsWith("__") || rowId.startsWith("rut:")) return;
    router.push(`${drilldownBase}/${rowId}`);
  };

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

      <KPIGrid>
        <KPICard
          label="Total"
          value={<span title={fmtCLP(data.grandTotal)}>{fmtCLPShort(data.grandTotal)}</span>}
          iconTone={tone}
          variant="brand"
        />
        <KPICard
          label="Clientes / Proveedores"
          value={data.rows.length}
          iconTone="violet"
        />
        <KPICard label="DTEs" value={data.documentsCount} iconTone="sky" />
        <KPICard
          label="Ticket promedio"
          value={
            <span
              title={fmtCLP(
                data.documentsCount > 0 ? data.grandTotal / data.documentsCount : 0
              )}
            >
              {fmtCLPShort(
                data.documentsCount > 0 ? data.grandTotal / data.documentsCount : 0
              )}
            </span>
          }
          iconTone="amber"
        />
      </KPIGrid>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar cliente / proveedor..."
      />

      {filteredRows.length === 0 ? (
        <Surface padding="lg" elevation={1}>
          <EmptyState
            icon={Grid3x3}
            title="Sin datos para los filtros aplicados"
            description="Probá ampliar el período o limpiar los filtros."
          />
        </Surface>
      ) : (
        <Surface padding="none" elevation={1} className={`overflow-hidden ${isPending ? "opacity-70" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] ds-num" style={{ minWidth: 240 + months.length * 92 }}>
              <thead className="bg-ds-surface-2">
                <tr>
                  <th
                    className="sticky left-0 z-10 px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-ds-text-3 bg-ds-surface-2"
                    style={{ minWidth: 220 }}
                  >
                    Cliente
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.key}
                      className="px-2 py-2 text-right text-[10px] font-mono uppercase tracking-wider text-ds-text-3"
                      style={{ minWidth: 84 }}
                    >
                      {m.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-ds-border-subtle hover:bg-ds-surface-2/40"
                  >
                    <td
                      className="sticky left-0 px-3 py-2 bg-ds-surface cursor-pointer"
                      onClick={() => handleRowClick(row.id)}
                    >
                      <div className="flex items-center gap-2">
                        {row.color && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: row.color }}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-ds-text-1 truncate">{row.label}</p>
                          {row.sublabel && (
                            <p className="text-[10px] text-ds-text-4 truncate">
                              {row.sublabel}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    {row.monthly.map((v, i) => {
                      const i01 = intensity(v);
                      return (
                        <td
                          key={i}
                          className="px-2 py-2 text-right text-ds-text-1 transition-opacity"
                          style={{
                            background:
                              v === 0
                                ? "transparent"
                                : `color-mix(in oklab, ${colorForRow(row.id)} ${(i01 * 100).toFixed(0)}%, transparent)`,
                          }}
                          title={v ? fmtCLP(v) : ""}
                        >
                          {v ? fmtCLPShort(v) : ""}
                        </td>
                      );
                    })}
                    <td
                      className="px-3 py-2 text-right text-ds-text-1 font-semibold"
                      title={fmtCLP(row.total)}
                    >
                      {fmtCLPShort(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ds-surface-2 border-t border-ds-border-default">
                  <td
                    className="sticky left-0 px-3 py-2 font-semibold text-ds-text-1 bg-ds-surface-2"
                  >
                    Total
                  </td>
                  {data.totalsByMonth.map((v, i) => (
                    <td
                      key={i}
                      className="px-2 py-2 text-right font-semibold text-ds-text-1"
                      title={fmtCLP(v)}
                    >
                      {fmtCLPShort(v)}
                    </td>
                  ))}
                  <td
                    className="px-3 py-2 text-right font-bold text-primary"
                    title={fmtCLP(data.grandTotal)}
                  >
                    {fmtCLPShort(data.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}
