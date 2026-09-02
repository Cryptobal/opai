"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LayoutDashboard, Plus } from "lucide-react";
import {
  EmptyState,
  KPIStrip,
  PageHero,
  Surface,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { usePlatformUi } from "../PlatformUiProvider";
import { RoleGuard } from "../RoleGuard";
import { PlatformError } from "../PlatformError";
import { TenantsTable } from "../tenants/TenantsTable";
import { platformJson } from "../platform-fetch";
import { formatClp, formatUf, minutesAgoLabel } from "../format";
import type { PlatformTenantRow } from "@/lib/platform/tenant-row";
import type { DashboardAction } from "@/lib/platform/dashboard-actions";

interface DashboardResponse {
  kpis: {
    estimatedMrrUf: number;
    estimatedMrrClp: number | null;
    payingTenants: number;
    trialingTenants: number;
    expiringTrials: number;
    graceTenants: number;
    openUpgradeRequests: number;
  };
  actions: DashboardAction[];
  tenants: PlatformTenantRow[];
}

export function OverviewClient() {
  const router = useRouter();
  const { openCreateTenant } = usePlatformUi();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await platformJson<DashboardResponse>("/api/platform/dashboard");
      setData(json);
      setFetchedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const k = data?.kpis;
  const trialHint =
    k && k.expiringTrials > 0
      ? `${k.expiringTrials} vencen en 7 días`
      : undefined;

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<LayoutDashboard />}
        iconTone="teal"
        title="Overview"
        subtitle={`Estado del negocio · ${minutesAgoLabel(fetchedAt)}`}
        actions={
          <RoleGuard minRole="admin">
            <Button type="button" variant="primary" className="h-10 sm:h-9" onClick={openCreateTenant}>
              <Plus className="h-4 w-4" />
              Nuevo tenant
            </Button>
          </RoleGuard>
        }
      />

      {error ? <PlatformError message={error} onRetry={() => { void load(); router.refresh(); }} /> : null}

      <KPIStrip
        items={[
          {
            label: "MRR",
            value: loading ? "…" : formatUf(k?.estimatedMrrUf ?? 0),
            hint: formatClp(k?.estimatedMrrClp ?? null),
            variant: "brand",
          },
          { label: "Tenants pagando", value: loading ? "…" : String(k?.payingTenants ?? 0) },
          {
            label: "En trial",
            value: loading ? "…" : String(k?.trialingTenants ?? 0),
            hint: trialHint,
            variant: (k?.expiringTrials ?? 0) > 0 ? "warn" : "default",
          },
          {
            label: "En gracia",
            value: loading ? "…" : String(k?.graceTenants ?? 0),
            variant: (k?.graceTenants ?? 0) > 0 ? "danger" : "default",
          },
          {
            label: "Solicitudes abiertas",
            value: loading ? "…" : String(k?.openUpgradeRequests ?? 0),
          },
        ]}
      />

      <Surface accent={data?.actions.length ? "warn" : undefined} padding="md">
        <h2 className="font-display text-[15px] text-ds-text-1">Requiere acción</h2>
        {loading ? (
          <p className="mt-2 text-[13px] text-ds-text-3">Cargando…</p>
        ) : !data?.actions.length ? (
          <EmptyState icon={CheckCircle2} title="Todo en orden" compact tone="ok" />
        ) : (
          <ul className="mt-3 space-y-2">
            {data.actions.map((a) => (
              <li key={`${a.kind}-${a.tenantId}`} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-ds-text-1">{a.text}</span>
                <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
                  <Link href={a.primary.href}>{a.primary.label}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] text-ds-text-1">Tenants</h2>
          <Link href="/platform/tenants" className="text-[13px] text-primary hover:underline">
            Ver todos →
          </Link>
        </div>
        <TenantsTable rows={(data?.tenants ?? []).slice(0, 8)} loading={loading} />
      </div>
    </div>
  );
}
