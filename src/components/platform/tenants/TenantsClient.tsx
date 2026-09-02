"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { PageHero, PageToolbar, SegmentedControl } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformUi } from "../PlatformUiProvider";
import { RoleGuard } from "../RoleGuard";
import { PlatformError } from "../PlatformError";
import { TenantsTable } from "./TenantsTable";
import { platformJson } from "../platform-fetch";
import type { PlatformTenantRow } from "@/lib/platform/tenant-row";
import type { StatusFilter } from "@/lib/platform/status-ui";
import { isStatusFilter } from "@/lib/platform/status-ui";

interface TenantsResponse {
  tenants: PlatformTenantRow[];
  total: number;
  page: number;
  pages: number;
  counts: Record<StatusFilter, number>;
}

export function TenantsClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const { openCreateTenant } = usePlatformUi();

  const q = sp.get("q") ?? "";
  const status = isStatusFilter(sp.get("status")) ? (sp.get("status") as StatusFilter) : "all";
  const plan = sp.get("plan") ?? "";
  const sort = sp.get("sort") ?? "createdAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);

  const [draftQ, setDraftQ] = useState(q);
  const [data, setData] = useState<TenantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftQ(q);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (plan) p.set("plan", plan);
    if (sort !== "createdAt") p.set("sort", sort);
    if (order !== "desc") p.set("order", order);
    if (page > 1) p.set("page", String(page));
    p.set("limit", "20");
    return p.toString();
  }, [q, status, plan, sort, order, page]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const s = next.toString();
    router.replace(s ? `/platform/tenants?${s}` : "/platform/tenants");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await platformJson<TenantsResponse>(`/api/platform/tenants?${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.counts;

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Building2 />}
        iconTone="teal"
        title="Tenants"
        subtitle={`${data?.total ?? "—"} empresas`}
        actions={
          <RoleGuard minRole="admin">
            <Button type="button" variant="primary" className="h-10 sm:h-9" onClick={openCreateTenant}>
              <Plus className="h-4 w-4" />
              Nuevo tenant
            </Button>
          </RoleGuard>
        }
      />

      <PageToolbar
        search={
          <form
            className="w-full sm:w-72"
            onSubmit={(e) => {
              e.preventDefault();
              setParams({ q: draftQ.trim() || null });
            }}
          >
            <Input
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="Nombre, slug o RUT"
              className="h-10 sm:h-9 font-mono"
            />
          </form>
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              ariaLabel="Estado"
              value={status}
              onChange={(id) => setParams({ status: id === "all" ? null : id })}
              items={[
                { id: "all", label: "Todos", count: counts?.all },
                { id: "paying", label: "Pagando", count: counts?.paying },
                { id: "trial", label: "Trial", count: counts?.trial },
                { id: "grace", label: "Gracia", count: counts?.grace },
                { id: "suspended", label: "Suspendidos", count: counts?.suspended },
              ]}
            />
            <select
              value={plan}
              onChange={(e) => setParams({ plan: e.target.value || null })}
              className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
            >
              <option value="">Todos los planes</option>
              <option value="starter">Starter</option>
              <option value="profesional">Profesional</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <select
              value={`${sort}:${order}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split(":");
                setParams({ sort: s, order: o });
              }}
              className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
            >
              <option value="createdAt:desc">Más recientes</option>
              <option value="name:asc">Nombre A–Z</option>
              <option value="lastActivity:desc">Última actividad</option>
            </select>
          </div>
        }
      />

      {error ? <PlatformError message={error} onRetry={() => void load()} /> : null}

      <TenantsTable
        rows={data?.tenants ?? []}
        loading={loading}
        emptyTitle="Sin resultados"
        emptyDescription="Prueba otro filtro o búsqueda."
      />

      {(data?.pages ?? 1) > 1 ? (
        <div className="flex items-center justify-end gap-2 text-[13px] text-ds-text-3">
          <Button
            type="button"
            variant="ghost"
            disabled={page <= 1}
            className="h-10 sm:h-9"
            onClick={() => setParams({ page: String(page - 1) })}
          >
            Anterior
          </Button>
          <span className="font-mono">
            {data?.page}/{data?.pages}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={page >= (data?.pages ?? 1)}
            className="h-10 sm:h-9"
            onClick={() => setParams({ page: String(page + 1) })}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
