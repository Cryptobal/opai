"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Surface, Tag, IconBubble, Spinner, EmptyState, type IconBubbleVariant } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftRight,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Package,
  Phone,
  RefreshCcw,
  Truck,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: unknown;
  createdAt: string;
  ipAddress?: string | null;
  user?: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const ENTITY_FILTERS: Array<{ value: string; label: string; icon: typeof Package }> = [
  { value: "", label: "Todos", icon: Package },
  { value: "warehouse", label: "Bodegas", icon: Building2 },
  { value: "product", label: "Productos", icon: Package },
  { value: "purchase", label: "Compras", icon: Package },
  { value: "movement", label: "Movimientos", icon: ArrowLeftRight },
  { value: "asset", label: "Activos", icon: Box },
  { value: "phone_line", label: "Líneas", icon: Phone },
];

const ACTION_LABELS: Record<string, string> = {
  "inventario.warehouse.created": "Creó bodega",
  "inventario.warehouse.updated": "Actualizó bodega",
  "inventario.warehouse.deleted": "Eliminó bodega",
  "inventario.product.created": "Creó producto",
  "inventario.product.updated": "Actualizó producto",
  "inventario.product.deleted": "Eliminó producto",
  "inventario.product.bulk_imported": "Importó productos en lote",
  "inventario.product.size.created": "Agregó talla",
  "inventario.product.size.deleted": "Eliminó talla",
  "inventario.product.variant.updated": "Actualizó variante",
  "inventario.purchase.created": "Registró compra",
  "inventario.purchase.updated": "Actualizó compra",
  "inventario.purchase.deleted": "Eliminó compra",
  "inventario.movement.delivery.created": "Registró entrega",
  "inventario.movement.delivery.reverted": "Revirtió entrega",
  "inventario.movement.transfer.created": "Movió stock entre bodegas",
  "inventario.movement.transfer.reverted": "Revirtió transferencia",
  "inventario.asset.created": "Registró activo",
  "inventario.phone_line.created": "Creó línea telefónica",
  "inventario.phone_line.updated": "Actualizó línea",
  "inventario.phone_line.deleted": "Eliminó línea",
  "inventario.phone_line.assigned": "Asignó línea",
  "inventario.phone_line.unassigned": "Desvinculó línea",
};

function actionTone(action: string): { variant: IconBubbleVariant; icon: typeof Package } {
  if (action.endsWith(".deleted") || action.endsWith(".reverted")) {
    return { variant: "danger", icon: Truck };
  }
  if (action.endsWith(".created")) {
    return { variant: "ok", icon: Package };
  }
  if (action.endsWith(".updated")) {
    return { variant: "warn", icon: RefreshCcw };
  }
  if (action.includes("transfer")) {
    return { variant: "info", icon: ArrowLeftRight };
  }
  return { variant: "neutral", icon: Package };
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return date.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatExact(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InventarioAuditList() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entity) params.set("entity", entity);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("limit", "30");
      const res = await fetch(`/api/ops/inventario/audit?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.success) {
        setItems(data.data ?? []);
        setPagination(data.pagination ?? null);
      } else {
        setItems([]);
        setPagination(null);
      }
    } catch {
      setItems([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [entity, from, to, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((entry) => {
      const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
      const userName = entry.user?.name ?? entry.user?.email ?? "";
      return (
        actionLabel.toLowerCase().includes(q) ||
        userName.toLowerCase().includes(q) ||
        (entry.entity ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2 min-w-0 sm:max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuario o acción…"
            className="h-10 sm:h-9"
          />
        </div>
        <Select value={entity || "all"} onValueChange={(v) => { setEntity(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_FILTERS.map((f) => (
              <SelectItem key={f.value || "all"} value={f.value || "all"}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="h-10 sm:h-9 w-[160px]"
            aria-label="Desde"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="h-10 sm:h-9 w-[160px]"
            aria-label="Hasta"
          />
          <Button size="sm" variant="outline" className="gap-2 h-10 sm:h-9" onClick={() => fetchData()}>
            <RefreshCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refrescar</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner block label="Cargando auditoría…" />
      ) : filtered.length === 0 ? (
        <Surface elevation={1} padding="none">
          <EmptyState
            icon={Clock}
            title="Sin eventos registrados"
            description="Las acciones del inventario aparecerán aquí en cuanto ocurran."
          />
        </Surface>
      ) : (
        <div className="space-y-1.5 ds-list-cascade">
          {filtered.map((entry) => {
            const tone = actionTone(entry.action);
            const expanded = expandedId === entry.id;
            const userName = entry.user?.name ?? entry.user?.email ?? "Sistema";
            const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;

            return (
              <Surface
                key={entry.id}
                elevation={1}
                padding="sm"
                hoverable
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(expanded ? null : entry.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedId(expanded ? null : entry.id);
                  }
                }}
                className="cursor-pointer text-left"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                  <IconBubble icon={tone.icon} variant={tone.variant} size="md" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ds-text-1">{actionLabel}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ds-text-3">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {userName}
                      </span>
                      <span aria-hidden>·</span>
                      <span title={formatExact(entry.createdAt)} className="font-mono">{formatRelative(entry.createdAt)}</span>
                      {entry.entity && (
                        <Tag variant="neutral" size="sm">
                          {entry.entity.replace("inventario.", "")}
                        </Tag>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-ds-text-4 transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </div>
                {expanded && (
                  <div className="mt-3 space-y-1.5 rounded-ds-md bg-ds-surface-2 p-3 text-xs">
                    <div className="grid gap-1 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Fecha</p>
                        <p className="font-mono text-ds-text-2">{formatExact(entry.createdAt)}</p>
                      </div>
                      {entry.user?.email && (
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Email</p>
                          <p className="truncate text-ds-text-2">{entry.user.email}</p>
                        </div>
                      )}
                      {entry.ipAddress && (
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">IP</p>
                          <p className="font-mono text-ds-text-2">{entry.ipAddress}</p>
                        </div>
                      )}
                      {entry.entityId && (
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Entidad</p>
                          <p className="font-mono break-all text-ds-text-2">{entry.entityId}</p>
                        </div>
                      )}
                    </div>
                    {entry.details != null &&
                      typeof entry.details === "object" &&
                      Object.keys(entry.details as Record<string, unknown>).length > 0 && (
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Detalle</p>
                          <pre className="mt-0.5 whitespace-pre-wrap rounded-ds-sm bg-ds-surface-3 p-2 text-[12px] leading-relaxed text-ds-text-2">
{JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </div>
                      )}
                  </div>
                )}
              </Surface>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2 text-[12px] text-ds-text-3">
          <span>
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} eventos
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-2"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-2"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
