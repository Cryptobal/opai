"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, Coins, Hash, Layers, Info } from "lucide-react";
import {
  DataTable,
  EmptyState,
  PageHero,
  Spinner,
  Stat,
  StatGrid,
  Surface,
  Tag,
  type DataTableColumn,
} from "@/components/opai-ds";

type UsageRow = {
  key: string;
  label: string;
  sublabel?: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  priced: boolean;
};

type UsageSummary = {
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
    unpricedRequests: number;
  };
  byFeature: UsageRow[];
  byModel: UsageRow[];
  byTenant: UsageRow[];
};

type Filters = { tenantId: string; from: string; to: string };

function isoDaysAgo(days: number): string {
  // Sin new Date() en server; este componente es client, así que es seguro.
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const fmtInt = (n: number) => n.toLocaleString("es-CL");

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })}k`;
  return fmtInt(n);
}

function fmtUSD(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildQuery(f: Filters): string {
  const q = new URLSearchParams();
  if (f.tenantId) q.set("tenantId", f.tenantId);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  return q.toString();
}

function UsageTable({ title, rows, unit }: { title: string; rows: UsageRow[]; unit: string }) {
  const columns: DataTableColumn<UsageRow>[] = [
    {
      id: "label",
      header: unit,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ds-body font-medium text-ds-text-1">{r.label}</p>
          {r.sublabel && <p className="truncate text-[12px] text-ds-text-3">{r.sublabel}</p>}
        </div>
      ),
    },
    {
      id: "requests",
      header: "Llamadas",
      align: "right",
      hideOnMobile: true,
      cell: (r) => <span className="ds-num text-ds-body text-ds-text-2">{fmtInt(r.requests)}</span>,
    },
    {
      id: "tokens",
      header: "Tokens",
      align: "right",
      hideOnMobile: true,
      cell: (r) => <span className="ds-num text-ds-body text-ds-text-2">{fmtTokens(r.totalTokens)}</span>,
    },
    {
      id: "cost",
      header: "Costo est.",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {!r.priced && (
            <Tag variant="warn" size="sm">s/tarifa</Tag>
          )}
          <span className="ds-num text-ds-body font-semibold text-ds-text-1">{fmtUSD(r.costUSD)}</span>
        </div>
      ),
    },
  ];

  return (
    <Surface elevation={1} padding="md" className="space-y-3 min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">{title}</p>
      {rows.length === 0 ? (
        <p className="text-ds-body text-ds-text-3">Sin datos para el período.</p>
      ) : (
        <>
          <div className="hidden sm:block">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} />
          </div>
          <ul className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <li key={r.key}>
                <Surface elevation={1} padding="sm" className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-ds-body font-medium text-ds-text-1">{r.label}</p>
                    <span className="ds-num text-ds-body font-semibold text-ds-text-1">{fmtUSD(r.costUSD)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-ds-text-3">
                      {r.sublabel ? `${r.sublabel} · ` : ""}{fmtInt(r.requests)} llamadas
                    </span>
                    <span className="ds-num text-[12px] text-ds-text-3">{fmtTokens(r.totalTokens)} tok</span>
                  </div>
                  {!r.priced && <Tag variant="warn" size="sm">costo s/tarifa</Tag>}
                </Surface>
              </li>
            ))}
          </ul>
        </>
      )}
    </Surface>
  );
}

export function AiUsageClient() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({ tenantId: "", from: isoDaysAgo(30), to: todayISO() });
  const [applied, setApplied] = useState<Filters>(filters);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/ai-usage/summary?${buildQuery(f)}`);
      if (res.status === 401) {
        router.push("/platform/login");
        return;
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al cargar");
      setData(json.data as UsageSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el consumo");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load(applied);
  }, [applied, load]);

  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));

  const totals = data?.totals;
  const unpricedPct = useMemo(() => {
    if (!totals || totals.requests === 0) return 0;
    return Math.round((totals.unpricedRequests / totals.requests) * 100);
  }, [totals]);

  return (
    <div className="space-y-6 ds-page-enter min-w-0">
      <Link
        href="/platform/settings"
        className="inline-flex items-center gap-1 text-ds-body text-ds-text-3 hover:text-ds-text-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Configuración
      </Link>
      <PageHero
        icon={<BarChart3 />}
        iconVariant="info"
        title="IA · Consumo"
        subtitle="tokens y costo estimado"
        description="Consumo de IA registrado en OPAI por función, modelo y empresa. El costo es una estimación a partir del tarifario interno (ai-pricing.ts); la facturación real vive en los dashboards de cada proveedor."
      />

      {/* Filtros */}
      <Surface elevation={1} padding="md" className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">Período</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="date"
            aria-label="Desde"
            className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1"
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
          />
          <input
            type="date"
            aria-label="Hasta"
            className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1"
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
          />
          <input
            className="h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1"
            placeholder="Tenant ID (opcional)"
            value={filters.tenantId}
            onChange={(e) => set({ tenantId: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setApplied(filters)}
            className="ds-tap h-10 sm:h-9 rounded-lg bg-primary px-4 text-ds-body font-medium text-primary-foreground"
          >
            Aplicar
          </button>
        </div>
      </Surface>

      {error && (
        <Surface elevation={1} padding="md" className="border border-status-danger-border bg-status-danger-soft">
          <p className="text-ds-body text-status-danger-fg">{error}</p>
        </Surface>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !data || data.totals.requests === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin consumo registrado"
          description="No hay registros de uso de IA (ai_usage_logs) para el período seleccionado."
        />
      ) : (
        <>
          {/* KPIs */}
          <StatGrid cols={2} lgCols={4}>
            <Stat label="Costo estimado" value={fmtUSD(totals!.costUSD)} icon={Coins} variant="brand" hint="según tarifario interno" />
            <Stat label="Llamadas" value={fmtInt(totals!.requests)} icon={Hash} hint="requests a IA" />
            <Stat label="Tokens" value={fmtTokens(totals!.totalTokens)} icon={Layers} hint={`${fmtTokens(totals!.inputTokens)} in · ${fmtTokens(totals!.outputTokens)} out`} />
            <Stat
              label="Sin tarifa"
              value={`${unpricedPct}%`}
              icon={Info}
              variant={unpricedPct > 0 ? "warn" : "default"}
              hint="requests con costo no estimado"
            />
          </StatGrid>

          {/* Aviso de estimación */}
          <Surface elevation={1} padding="sm" className="flex items-start gap-2 border border-status-info-border bg-status-info-soft">
            <Info className="h-4 w-4 shrink-0 text-status-info-fg mt-0.5" />
            <p className="text-[12px] text-ds-text-2 leading-snug">
              Costo <strong>estimado</strong> a partir de tokens registrados (muchos aproximados ~4 chars/token) y del
              tarifario en <code className="text-[12px]">src/lib/ai-pricing.ts</code>. No incluye audio de Whisper
              (cobra por minuto) ni modelos sin tarifa. La cifra oficial de facturación está en los paneles de
              OpenAI / Anthropic / Google.
            </p>
          </Surface>

          {/* Cortes */}
          <div className="grid gap-4 lg:grid-cols-2">
            <UsageTable title="Por función (feature)" rows={data.byFeature} unit="Función" />
            <UsageTable title="Por modelo" rows={data.byModel} unit="Modelo" />
          </div>
          <UsageTable title="Por empresa (tenant)" rows={data.byTenant} unit="Empresa" />
        </>
      )}
    </div>
  );
}
