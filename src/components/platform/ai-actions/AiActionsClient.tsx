"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { EmptyState, PageHero, Spinner, Surface } from "@/components/opai-ds";
import { AiActionsFilters, type AiActionsFilterState } from "./AiActionsFilters";
import { AiActionsTable } from "./AiActionsTable";
import type { AiActionRow, AiActionsResponse } from "./types";

const DEFAULT_FILTERS: AiActionsFilterState = {
  tenantId: "",
  toolName: "",
  status: "",
  from: "",
  to: "",
};

function buildQuery(filters: AiActionsFilterState, page: number): string {
  const q = new URLSearchParams();
  if (filters.tenantId) q.set("tenantId", filters.tenantId);
  if (filters.toolName) q.set("toolName", filters.toolName);
  if (filters.status) q.set("status", filters.status);
  if (filters.from) q.set("from", filters.from);
  if (filters.to) q.set("to", filters.to);
  q.set("page", String(page));
  return q.toString();
}

export function AiActionsClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState<AiActionsFilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<AiActionsFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AiActionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: AiActionsFilterState, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/ai-actions?${buildQuery(f, p)}`);
      if (res.status === 401) {
        router.push("/platform/login");
        return;
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al cargar");
      const data = json.data as AiActionsResponse;
      setRows(data.rows);
      setTotal(data.total);
      setPage(data.page);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar acciones");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load(applied, page);
  }, [applied, page, load]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6 ds-page-enter min-w-0">
      <Link
        href="/platform/settings"
        className="inline-flex items-center gap-1 text-[13px] text-ds-text-3 hover:text-ds-text-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Configuración
      </Link>
      <PageHero
        icon={<Bot />}
        iconVariant="info"
        title="IA · Acciones"
        subtitle="auditoría del agente"
        description="Registro de herramientas ejecutadas por el asistente OPAI Intelligence, con estado, duración y entidad resultante."
      />
      <AiActionsFilters
        value={filters}
        onChange={setFilters}
        onApply={() => { setApplied(filters); setPage(1); }}
      />
      {error && (
        <Surface elevation={1} padding="md" className="border border-status-danger-border bg-status-danger-soft">
          <p className="text-[13px] text-status-danger-fg">{error}</p>
        </Surface>
      )}
      {!ready && loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 && !loading ? (
        <EmptyState icon={Bot} title="Sin acciones" description="No hay registros AiActionLog para los filtros seleccionados." />
      ) : (
        <AiActionsTable rows={rows} loading={loading} />
      )}
      {total > 0 && (
        <Surface elevation={1} padding="sm" className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-ds-text-3">
            {total} registro{total !== 1 ? "s" : ""} · página {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="ds-tap rounded-lg border border-ds-border-default px-3 py-2 text-[13px] disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="ds-tap rounded-lg border border-ds-border-default px-3 py-2 text-[13px] disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </Surface>
      )}
    </div>
  );
}
