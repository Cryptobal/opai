"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { DataTable, KPIStrip, PageHero, SegmentedControl, Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { PlatformError } from "../PlatformError";
import { StatusTag } from "../StatusTag";
import { platformJson } from "../platform-fetch";
import { formatClp, formatUf } from "../format";
import type { MonthlyDisplay, StatusVariant } from "@/lib/platform/status-ui";

interface BillingRow {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  statusLabel: string;
  statusVariant: StatusVariant;
  activeGuards: number;
  monthly: MonthlyDisplay;
  planPrice: number;
  addonsTotal: number;
  complete: boolean;
}

interface BillingResponse {
  month: string;
  tenants: BillingRow[];
  totals: {
    mrrUf: number;
    mrrClp: number | null;
    totalGuards: number;
    paying: number;
    pendingPrice: number;
  };
}

export function BillingClient() {
  const [month, setMonth] = useState<"this" | "prev" | "custom">("this");
  const [custom, setCustom] = useState("");
  const [data, setData] = useState<BillingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const param = month === "prev" ? "prev" : month === "custom" && custom ? custom : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = param ? `?month=${param}` : "";
      setData(await platformJson<BillingResponse>(`/api/platform/billing${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [param]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = data?.totals;
  const exportMonth = data?.month ?? custom;

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Receipt />}
        iconTone="teal"
        title="Facturación"
        subtitle={data?.month ?? "Mes actual"}
        actions={
          <Button asChild variant="secondary" className="h-10 sm:h-9">
            <a href={`/api/platform/billing/export?month=${exportMonth}`}>Exportar Excel</a>
          </Button>
        }
      />
      <SegmentedControl
        ariaLabel="Mes"
        value={month}
        onChange={setMonth}
        items={[
          { id: "this", label: "Este mes" },
          { id: "prev", label: "Mes anterior" },
          { id: "custom", label: "Elegir" },
        ]}
      />
      {month === "custom" ? (
        <input
          type="month"
          className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-3 font-mono text-[13px]"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      ) : null}
      {error ? <PlatformError message={error} onRetry={() => void load()} /> : null}
      <KPIStrip
        items={[
          { label: "MRR", value: loading ? "…" : formatUf(t?.mrrUf ?? 0), hint: formatClp(t?.mrrClp ?? null), variant: "brand" },
          { label: "Pagando", value: loading ? "…" : String(t?.paying ?? 0) },
          { label: "Guardias", value: loading ? "…" : String(t?.totalGuards ?? 0) },
          { label: "Precio pendiente", value: loading ? "…" : String(t?.pendingPrice ?? 0), variant: (t?.pendingPrice ?? 0) > 0 ? "warn" : "default" },
          { label: "Filas", value: loading ? "…" : String(data?.tenants.length ?? 0) },
        ]}
      />
      <div className="overflow-x-auto">
        <DataTable
          rowKey={(r) => r.id}
          rows={data?.tenants ?? []}
          loading={loading}
          columns={[
            { id: "n", header: "Empresa", cell: (r) => r.name },
            { id: "e", header: "Estado", cell: (r) => <StatusTag label={r.statusLabel} variant={r.statusVariant} /> },
            { id: "p", header: "Plan", cell: (r) => <span className="font-mono text-[12px]">{r.plan ?? "—"}</span> },
            { id: "g", header: "Guardias", cell: (r) => <span className="font-mono">{r.activeGuards}</span> },
            {
              id: "m",
              header: "Mensual",
              cell: (r) =>
                r.monthly.kind === "trial" || r.monthly.kind === "exempt" ? (
                  <span className="font-mono text-ds-text-3">{r.monthly.text}</span>
                ) : (
                  <span className="font-mono">{r.monthly.text}</span>
                ),
            },
          ]}
        />
      </div>
      {data ? (
        <Surface elevation={2} padding="md" className="flex justify-between font-mono text-[13px]">
          <span>Total MRR</span>
          <span>{formatUf(data.totals.mrrUf)}</span>
        </Surface>
      ) : null}
    </div>
  );
}
