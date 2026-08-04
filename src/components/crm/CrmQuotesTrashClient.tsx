"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { DataTable, EmptyState, PageHero, Spinner, Surface, Tag, type TagVariant } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatCLP } from "@/lib/utils";

type TrashRow = {
  id: string;
  quoteId: string;
  code: string;
  name: string | null;
  status: string;
  installationName: string | null;
  salePriceMonthly: string | number | null;
  reason: string | null;
  deletedAt: string;
  expiresAt: string;
};

const STATUS_TAG: Record<string, { label: string; variant: TagVariant }> = {
  draft: { label: "Borrador", variant: "warn" },
  sent: { label: "Enviada", variant: "info" },
  approved: { label: "Aprobada", variant: "ok" },
  accepted: { label: "Aceptada", variant: "ok" },
  rejected: { label: "Rechazada", variant: "danger" },
};

const PAGE_SIZE = 25;

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function CrmQuotesTrashClient() {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(pageNum), pageSize: String(PAGE_SIZE) });
        if (debounced) params.set("search", debounced);
        const res = await fetch(`/api/cpq/quotes/trash?${params}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Error al cargar la papelera");
        const incoming: TrashRow[] = json.data ?? [];
        setRows((prev) => (replace ? incoming : [...prev, ...incoming]));
        setPage(pageNum);
        setTotal(json.meta?.total ?? incoming.length);
        setHasMore(Boolean(json.meta?.hasMore));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar la papelera");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debounced],
  );

  useEffect(() => {
    void fetchRows(1, true);
  }, [fetchRows]);

  const restore = useCallback(async (row: TrashRow) => {
    if (restoringId) return;
    setRestoringId(row.id);
    try {
      const res = await fetch(`/api/cpq/quotes/trash/${row.id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo restaurar");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success(
        json.data?.codeChanged
          ? `Restaurada con nuevo código: ${json.data.code}`
          : `Cotización ${json.data?.code ?? row.code} restaurada`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restaurar la cotización");
    } finally {
      setRestoringId(null);
    }
  }, [restoringId]);

  const RestoreButton = ({ row }: { row: TrashRow }) => (
    <Button
      size="sm"
      variant="outline"
      className="h-10 sm:h-9 gap-1.5"
      disabled={restoringId === row.id}
      onClick={() => void restore(row)}
    >
      {restoringId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      Restaurar
    </Button>
  );

  const columns = [
    { id: "code", header: "Código", cell: (r: TrashRow) => <span className="font-mono text-sm">{r.code}</span> },
    { id: "name", header: "Nombre", cell: (r: TrashRow) => <span className="truncate">{r.name || r.installationName || "—"}</span> },
    {
      id: "status",
      header: "Estado",
      cell: (r: TrashRow) => {
        const s = STATUS_TAG[r.status] ?? { label: r.status, variant: "neutral" as TagVariant };
        return <Tag variant={s.variant} size="sm">{s.label}</Tag>;
      },
    },
    {
      id: "sale",
      header: "P. venta",
      align: "right" as const,
      hideOnMobile: true,
      cell: (r: TrashRow) => (r.salePriceMonthly != null ? formatCLP(Number(r.salePriceMonthly)) : "—"),
    },
    { id: "deleted", header: "Eliminada", hideOnMobile: true, cell: (r: TrashRow) => <span className="text-ds-text-3">{fmtDate(r.deletedAt)}</span> },
    {
      id: "expires",
      header: "Expira",
      cell: (r: TrashRow) => {
        const d = daysLeft(r.expiresAt);
        return <Tag variant={d <= 3 ? "danger" : d <= 7 ? "warn" : "neutral"} size="sm">{d} d</Tag>;
      },
    },
    { id: "action", header: "", align: "right" as const, sticky: "right" as const, cell: (r: TrashRow) => <RestoreButton row={r} /> },
  ];

  const emptyState = (
    <EmptyState
      icon={Trash2}
      title={debounced ? "Sin resultados" : "Papelera vacía"}
      description={
        debounced
          ? "No hay cotizaciones eliminadas que coincidan con la búsqueda."
          : "Las cotizaciones eliminadas aparecen aquí y pueden restaurarse dentro de su plazo de retención."
      }
      compact
    />
  );

  return (
    <div className="space-y-4">
      <PageHero
        icon={<Trash2 />}
        iconVariant="neutral"
        title="Papelera de cotizaciones"
        description="Cotizaciones eliminadas que puedes restaurar antes de que expire su plazo de retención."
        backHref="/crm/cotizaciones"
        backLabel="Cotizaciones"
      />

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código, nombre o instalación..."
          className="pl-9 h-10 sm:h-9"
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <EmptyState
          icon={Trash2}
          title="No se pudo cargar la papelera"
          description={error}
          action={<Button size="sm" variant="outline" onClick={() => void fetchRows(1, true)}>Reintentar</Button>}
          compact
        />
      ) : rows.length === 0 ? (
        emptyState
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden sm:block">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={emptyState} />
          </div>
          {/* Mobile */}
          <div className="space-y-2 sm:hidden">
            {rows.map((r) => {
              const s = STATUS_TAG[r.status] ?? { label: r.status, variant: "neutral" as TagVariant };
              const d = daysLeft(r.expiresAt);
              return (
                <Surface key={r.id} elevation={1} padding="sm" className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{r.code}</span>
                    <Tag variant={s.variant} size="sm">{s.label}</Tag>
                  </div>
                  {(r.name || r.installationName) && (
                    <p className="text-ds-body text-ds-text-2 truncate">{r.name || r.installationName}</p>
                  )}
                  <div className="flex items-center gap-2 text-ds-caption text-ds-text-3">
                    <span>Eliminada {fmtDate(r.deletedAt)}</span>
                    <Tag variant={d <= 3 ? "danger" : d <= 7 ? "warn" : "neutral"} size="sm">Expira en {d} d</Tag>
                  </div>
                  <RestoreButton row={r} />
                </Surface>
              );
            })}
          </div>

          {(hasMore || loadingMore) && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <p className="text-ds-caption text-ds-text-3">Mostrando {rows.length} de {total}</p>
              <Button
                variant="outline"
                className="h-10 sm:h-9 min-w-[160px]"
                disabled={loadingMore}
                onClick={() => void fetchRows(page + 1, false)}
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
