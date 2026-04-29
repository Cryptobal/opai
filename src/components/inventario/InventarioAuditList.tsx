"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OpaiSurface } from "@/components/opai";
import { Badge } from "@/components/ui/badge";
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
  Loader2,
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

function actionTone(action: string): { color: string; bg: string; icon: typeof Package } {
  if (action.endsWith(".deleted") || action.endsWith(".reverted")) {
    return { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: Truck };
  }
  if (action.endsWith(".created")) {
    return { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: Package };
  }
  if (action.endsWith(".updated")) {
    return { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: RefreshCcw };
  }
  if (action.includes("transfer")) {
    return { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", icon: ArrowLeftRight };
  }
  return { color: "text-muted-foreground", bg: "bg-muted/40", icon: Package };
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
            className="h-9"
          />
        </div>
        <Select value={entity || "all"} onValueChange={(v) => { setEntity(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
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
            className="h-9 w-[160px]"
            aria-label="Desde"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="h-9 w-[160px]"
            aria-label="Hasta"
          />
          <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchData()}>
            <RefreshCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refrescar</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando auditoría…
        </div>
      ) : filtered.length === 0 ? (
        <OpaiSurface className="py-10 text-center">
          <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Sin eventos registrados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Las acciones del inventario aparecerán aquí en cuanto ocurran.
          </p>
        </OpaiSurface>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((entry) => {
            const tone = actionTone(entry.action);
            const Icon = tone.icon;
            const expanded = expandedId === entry.id;
            const userName = entry.user?.name ?? entry.user?.email ?? "Sistema";
            const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;

            return (
              <OpaiSurface
                key={entry.id}
                variant="tight"
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
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone.bg, tone.color)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{actionLabel}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {userName}
                      </span>
                      <span aria-hidden>·</span>
                      <span title={formatExact(entry.createdAt)}>{formatRelative(entry.createdAt)}</span>
                      {entry.entity && (
                        <Badge variant="outline" className="text-[10px]">
                          {entry.entity.replace("inventario.", "")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </div>
                {expanded && (
                  <div className="mt-3 space-y-1.5 rounded-md bg-foreground/[0.03] p-3 text-xs">
                    <div className="grid gap-1 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">Fecha</p>
                        <p className="font-mono">{formatExact(entry.createdAt)}</p>
                      </div>
                      {entry.user?.email && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">Email</p>
                          <p className="truncate">{entry.user.email}</p>
                        </div>
                      )}
                      {entry.ipAddress && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">IP</p>
                          <p className="font-mono">{entry.ipAddress}</p>
                        </div>
                      )}
                      {entry.entityId && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">Entidad</p>
                          <p className="font-mono break-all">{entry.entityId}</p>
                        </div>
                      )}
                    </div>
                    {entry.details != null &&
                      typeof entry.details === "object" &&
                      Object.keys(entry.details as Record<string, unknown>).length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">Detalle</p>
                          <pre className="mt-0.5 whitespace-pre-wrap rounded bg-background/60 p-2 text-[11px] leading-relaxed">
{JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </div>
                      )}
                  </div>
                )}
              </OpaiSurface>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span>
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} eventos
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
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
