"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  DollarSign,
  FileBarChart,
  MapPin,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  DataTable,
  EmptyState,
  PageHero,
  SegmentedControl,
  Spinner,
  Stat,
  StatGrid,
  Surface,
  Tag,
  type DataTableColumn,
} from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
import { cn } from "@/lib/utils";
import type {
  PnlLineSeries,
  PnlLineTotals,
  ProjectedPnlInstallationRow,
  ProjectedPnlResult,
} from "@/modules/finance/flow-v3/projected-pnl";

type Scope = "company" | "installations";

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

function Amount({ n, emphasize }: { n: number; emphasize?: boolean }) {
  return (
    <span
      title={fmtCLP(n)}
      className={cn(
        "ds-num",
        emphasize && "font-semibold",
        n < 0 ? "text-status-danger-fg" : emphasize ? "text-ds-text-1" : "text-ds-text-2",
      )}
    >
      {fmtCLPShort(n)}
    </span>
  );
}

const LINE_META: Array<{
  id: keyof PnlLineSeries;
  label: string;
  companyHint?: string;
  instHint?: string;
}> = [
  { id: "revenue", label: "Ingresos operacionales" },
  { id: "personnel", label: "Costo de personal" },
  { id: "extraShifts", label: "Turnos extra" },
  { id: "directCost", label: "Costos directos" },
  { id: "gav", label: "GAV", instHint: "Prorrateado por ingresos" },
  { id: "result", label: "Resultado" },
];

function MonthlyMatrix({
  months,
  series,
  gavProrated,
}: {
  months: ProjectedPnlResult["months"];
  series: PnlLineSeries;
  gavProrated?: boolean;
}) {
  return (
    <>
      <div className="hidden sm:block overflow-x-auto border border-ds-border-subtle rounded-xl">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-ds-border-subtle bg-ds-surface-2/60">
              <th className="text-left px-3 py-2.5 font-medium text-ds-text-3 whitespace-nowrap">
                Concepto
              </th>
              {months.map((m) => (
                <th
                  key={m.key}
                  className={cn(
                    "text-right px-3 py-2.5 font-medium text-ds-text-3 whitespace-nowrap",
                    m.isCurrent && "text-primary",
                  )}
                >
                  {m.label}
                </th>
              ))}
              <th className="text-right px-3 py-2.5 font-medium text-ds-text-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {LINE_META.map((line) => {
              const values = series[line.id];
              const total = values.reduce((a, b) => a + b, 0);
              const isResult = line.id === "result";
              return (
                <tr
                  key={line.id}
                  className={cn(
                    "border-t border-ds-border-subtle",
                    isResult && "bg-ds-surface-2/40",
                  )}
                >
                  <td className="px-3 py-2.5 text-ds-text-1 whitespace-nowrap">
                    {line.label}
                    {gavProrated && line.id === "gav" && (
                      <span className="block text-[12px] text-ds-text-3">
                        {line.instHint}
                      </span>
                    )}
                  </td>
                  {values.map((v, i) => (
                    <td key={months[i]?.key ?? i} className="px-3 py-2.5 text-right">
                      <Amount n={v} emphasize={isResult} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <Amount n={total} emphasize />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="sm:hidden space-y-3 ds-list-cascade">
        {months.map((m, i) => (
          <li key={m.key}>
            <Surface elevation={1} padding="md">
              <p className={cn("text-[13px] font-semibold mb-2", m.isCurrent && "text-primary")}>
                {m.label}
              </p>
              <dl className="space-y-1.5">
                {LINE_META.map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-3">
                    <dt className="text-[13px] text-ds-text-3">{line.label}</dt>
                    <dd>
                      <Amount n={series[line.id][i] ?? 0} emphasize={line.id === "result"} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Surface>
          </li>
        ))}
      </ul>
    </>
  );
}

function Kpis({ totals, gavProrated }: { totals: PnlLineTotals; gavProrated?: boolean }) {
  return (
    <StatGrid cols={2} lgCols={4}>
      <Stat
        label="Ingresos"
        value={fmtCLPShort(totals.revenue)}
        hint={fmtCLP(totals.revenue)}
        icon={DollarSign}
        variant="brand"
        animate={false}
      />
      <Stat
        label="Costo de personal"
        value={fmtCLPShort(totals.personnel + totals.extraShifts)}
        hint={fmtCLP(totals.personnel + totals.extraShifts)}
        icon={Users}
        variant="warn"
      />
      <Stat
        label={gavProrated ? "GAV prorrateado" : "GAV"}
        value={fmtCLPShort(totals.gav)}
        hint={fmtCLP(totals.gav)}
        icon={Wallet}
        variant="default"
      />
      <Stat
        label="Resultado"
        value={fmtCLPShort(totals.result)}
        hint={`${fmtCLP(totals.result)} · ${totals.marginPct.toFixed(1)}%`}
        icon={totals.result >= 0 ? TrendingUp : TrendingDown}
        variant={totals.result >= 0 ? "ok" : "danger"}
      />
    </StatGrid>
  );
}

export function ResultadoClient() {
  const [data, setData] = useState<ProjectedPnlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("company");
  const [installationId, setInstallationId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/finance/flow-v3/projected-pnl")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok || !json?.success) throw new Error(json?.error ?? "No se pudo cargar");
        return json.data as ProjectedPnlResult;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => data?.installations.find((i) => i.installationId === installationId) ?? null,
    [data, installationId],
  );

  const rankingColumns: DataTableColumn<ProjectedPnlInstallationRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Instalación",
        cell: (r) => <span className="text-ds-text-1">{r.name}</span>,
      },
      {
        id: "revenue",
        header: "Ingresos",
        align: "right",
        hideOnMobile: true,
        cell: (r) => <Amount n={r.totals.revenue} />,
      },
      {
        id: "cost",
        header: "Costo directo",
        align: "right",
        hideOnMobile: true,
        cell: (r) => <Amount n={r.totals.personnel + r.totals.extraShifts + r.totals.directCost} />,
      },
      {
        id: "gav",
        header: "GAV",
        align: "right",
        hideOnMobile: true,
        cell: (r) => <Amount n={r.totals.gav} />,
      },
      {
        id: "result",
        header: "Resultado",
        align: "right",
        cell: (r) => <Amount n={r.totals.result} emphasize />,
      },
      {
        id: "pct",
        header: "%",
        align: "right",
        cell: (r) => (
          <span className={cn("ds-num text-[12px]", r.totals.result < 0 ? "text-status-danger-fg" : "text-ds-text-3")}>
            {r.totals.marginPct.toFixed(1)}%
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 ds-page-enter min-w-0">
      <FinanceN3Chips submoduleKey="finance-flujo-caja" />
      <PageHero
        icon={FileBarChart}
        iconTone="teal"
        title="Resultado proyectado"
        subtitle="estado de resultados mensual"
        description="Ingresos por período de facturación y costos del servicio. No es tesorería: el cobro y el pago siguen en Caja."
      />

      {loading && (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3 py-8">
          <Spinner size="sm" label="Cargando resultado proyectado" />
        </div>
      )}

      {error && (
        <Surface elevation={1} padding="md" className="border border-status-danger-border bg-status-danger-soft">
          <p className="text-[13px] text-status-danger-fg">{error}</p>
        </Surface>
      )}

      {data && !loading && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl
              size="md"
              ariaLabel="Alcance"
              value={scope}
              onChange={(id) => setScope(id)}
              items={[
                { id: "company", label: "Empresa", icon: Building2 },
                { id: "installations", label: "Por instalación", icon: MapPin },
              ]}
            />
            <Tag variant="info" size="md">
              GAV prorrateado por ingresos
            </Tag>
          </div>

          {scope === "company" && (
            <>
              <Kpis totals={data.company.totals} />
              <MonthlyMatrix months={data.months} series={data.company} />
              {data.unassigned && (
                <p className="text-[12px] text-ds-text-3">
                  Ingresos sin instalación: {fmtCLP(data.unassigned.revenue)}. No se
                  asignan a una faena.
                </p>
              )}
            </>
          )}

          {scope === "installations" && (
            <>
              {data.installations.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="Sin instalaciones con movimiento"
                  description="Cuando haya facturación o dotación atribuida a una instalación, aparecerán aquí."
                />
              ) : (
                <>
                  <label className="flex flex-col gap-1.5 max-w-md">
                    <span className="text-[12px] text-ds-text-3">Instalación</span>
                    <select
                      className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
                      value={installationId}
                      onChange={(e) => setInstallationId(e.target.value)}
                    >
                      <option value="">Todas (ranking)</option>
                      {data.installations.map((i) => (
                        <option key={i.installationId} value={i.installationId}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!selected && (
                    <>
                      <div className="hidden sm:block">
                        <DataTable
                          columns={rankingColumns}
                          rows={data.installations}
                          rowKey={(r) => r.installationId}
                          onRowClick={(r) => setInstallationId(r.installationId)}
                          rowVariant={(r) => (r.totals.result < 0 ? "danger" : "default")}
                        />
                      </div>
                      <ul className="sm:hidden space-y-3 ds-list-cascade">
                        {data.installations.map((r) => (
                          <li key={r.installationId}>
                            <Surface
                              elevation={1}
                              padding="md"
                              tappable
                              onClick={() => setInstallationId(r.installationId)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-[13px] font-semibold text-ds-text-1">{r.name}</p>
                                <Amount n={r.totals.result} emphasize />
                              </div>
                              <p className="mt-1 text-[12px] text-ds-text-3">
                                Ingresos {fmtCLPShort(r.totals.revenue)} · {r.totals.marginPct.toFixed(1)}%
                              </p>
                            </Surface>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {selected && (
                    <>
                      <Kpis totals={selected.totals} gavProrated />
                      <MonthlyMatrix
                        months={data.months}
                        series={selected.monthly}
                        gavProrated
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
