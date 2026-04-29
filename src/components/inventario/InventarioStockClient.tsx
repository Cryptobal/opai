"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Package,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import {
  Stat,
  StatGrid,
  Surface,
  Toolbar,
  Tag,
  EmptyState,
  Spinner,
  DataTable,
  type DataTableColumn,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { InventarioTransferDialog } from "@/components/inventario/InventarioTransferDialog";

type StockRecord = {
  id: string;
  quantity: number;
  minStock: number;
  avgCost: number | null;
  warehouse: { id: string; name: string; type: string };
  variant: {
    minStock: number;
    product: { name: string };
    size: { sizeCode: string } | null;
  };
};

type StockStatus = "critical" | "low" | "ok";

function getStatus(qty: number, min: number): StockStatus {
  if (qty === 0) return "critical";
  if (min > 0 && qty <= min) return "low";
  return "ok";
}

const STATUS_LABEL: Record<StockStatus, string> = {
  critical: "Agotado",
  low: "Bajo mínimo",
  ok: "OK",
};

interface Props {
  canEdit: boolean;
}

function variantLabel(s: StockRecord) {
  return s.variant.size
    ? `${s.variant.product.name} · ${s.variant.size.sizeCode}`
    : s.variant.product.name;
}

export function InventarioStockClient({ canEdit }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const warehouseIdFromUrl = searchParams.get("warehouseId") ?? "";

  const [stock, setStock] = useState<StockRecord[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "alerts">("all");
  const [search, setSearch] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouseIdFromUrl);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/ops/inventario/stock"),
        fetch("/api/ops/inventario/warehouses"),
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      if (!r1.ok) throw new Error(d1?.error ?? "Error cargando stock");
      setStock(Array.isArray(d1) ? d1 : []);
      setWarehouses(Array.isArray(d2) ? d2 : []);
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setWarehouseFilter = (id: string) => {
    setSelectedWarehouseId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("warehouseId", id);
    else params.delete("warehouseId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    let result = stock;
    if (selectedWarehouseId) {
      result = result.filter((s) => s.warehouse.id === selectedWarehouseId);
    }
    if (filter === "alerts") {
      result = result.filter(
        (s) => getStatus(s.quantity, s.variant.minStock) !== "ok",
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => variantLabel(s).toLowerCase().includes(q));
    }
    return result;
  }, [stock, filter, search, selectedWarehouseId]);

  const byWarehouse = useMemo(
    () =>
      filtered.reduce<Record<string, StockRecord[]>>((acc, s) => {
        const key = s.warehouse.name;
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
      }, {}),
    [filtered],
  );

  const criticalCount = stock.filter(
    (s) => getStatus(s.quantity, s.variant.minStock) === "critical",
  ).length;
  const lowCount = stock.filter(
    (s) => getStatus(s.quantity, s.variant.minStock) === "low",
  ).length;
  const totalUnits = stock.reduce((sum, s) => sum + s.quantity, 0);

  // Columnas tabla desktop
  const columns: DataTableColumn<StockRecord>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Producto / Talla",
        cell: (s) => <span className="text-ds-text-1">{variantLabel(s)}</span>,
      },
      {
        id: "qty",
        header: "Cantidad",
        align: "right",
        cell: (s) => {
          const status = getStatus(s.quantity, s.variant.minStock);
          const color =
            status === "critical"
              ? "text-status-danger-fg"
              : status === "low"
                ? "text-status-warn-fg"
                : "text-ds-text-1";
          return (
            <span className={cn("font-semibold", color)}>{s.quantity}</span>
          );
        },
      },
      {
        id: "min",
        header: "Mín",
        align: "right",
        cell: (s) => (
          <span className="text-ds-text-3">
            {s.variant.minStock || "—"}
          </span>
        ),
      },
      {
        id: "cost",
        header: "Costo prom.",
        align: "right",
        hideOnMobile: true,
        cell: (s) =>
          s.avgCost != null
            ? `$${Number(s.avgCost).toLocaleString("es-CL")}`
            : "—",
      },
      {
        id: "status",
        header: "Estado",
        align: "center",
        cell: (s) => {
          const status = getStatus(s.quantity, s.variant.minStock);
          if (status === "ok") return null;
          return (
            <Tag
              variant={status === "critical" ? "danger" : "warn"}
              size="sm"
            >
              {STATUS_LABEL[status]}
            </Tag>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 ds-page-enter">
      {/* KPIs */}
      <StatGrid lgCols={4}>
        <Stat label="Variantes" value={stock.length} animate icon={Package} />
        <Stat
          label="Unidades"
          value={totalUnits}
          animate
          icon={WarehouseIcon}
        />
        <Stat
          label="Agotados"
          value={criticalCount}
          variant={criticalCount > 0 ? "danger" : "default"}
          animate
        />
        <Stat
          label="Bajo mínimo"
          value={lowCount}
          variant={lowCount > 0 ? "warn" : "default"}
          animate
        />
      </StatGrid>

      {/* Toolbar */}
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar producto…"
        controls={
          <>
            <Select
              value={selectedWarehouseId || "all"}
              onValueChange={(v) =>
                setWarehouseFilter(v === "all" ? "" : v)
              }
            >
              <SelectTrigger className="h-10 w-44 sm:w-56 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las bodegas</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="h-10 shrink-0"
            >
              Todos ({stock.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filter === "alerts" ? "default" : "outline"}
              onClick={() => setFilter("alerts")}
              className="h-10 gap-1 shrink-0"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Alertas ({criticalCount + lowCount})
            </Button>
          </>
        }
        primaryAction={
          canEdit ? <InventarioTransferDialog onCompleted={fetchData} /> : null
        }
      />

      {/* Content */}
      {loading ? (
        <Spinner block label="Cargando stock…" />
      ) : error ? (
        <Surface elevation={1} padding="md" className="border-status-warn-border bg-status-warn-soft">
          <p className="text-sm text-status-warn-fg">{error}</p>
        </Surface>
      ) : filtered.length === 0 ? (
        <Surface elevation={1} padding="none">
          <EmptyState
            icon={Package}
            title={
              filter === "alerts"
                ? "No hay alertas de stock"
                : "Sin stock que mostrar"
            }
            description={
              filter === "alerts"
                ? "Todo en orden, no hay productos por debajo del mínimo."
                : "Registra una compra para ver el inventario."
            }
            tone={filter === "alerts" ? "ok" : "neutral"}
          />
        </Surface>
      ) : (
        <div className="space-y-6">
          {Object.entries(byWarehouse).map(([whName, items]) => {
            const subtotal = items.reduce((sum, s) => sum + s.quantity, 0);
            return (
              <div key={items[0]?.warehouse.id ?? whName}>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="inline-flex items-center gap-2 text-[15px] font-semibold text-ds-text-1">
                    <WarehouseIcon className="h-4 w-4 text-ds-text-3" />
                    {whName}
                  </h3>
                  <span className="text-[12px] font-mono ds-num text-ds-text-3">
                    {subtotal.toLocaleString("es-CL")} unid.
                  </span>
                </div>

                {/* Mobile: cards */}
                <ul className="space-y-2 sm:hidden ds-list-cascade">
                  {items.map((s) => {
                    const status = getStatus(s.quantity, s.variant.minStock);
                    const variant: "default" | "warn" | "danger" =
                      status === "critical"
                        ? "danger"
                        : status === "low"
                          ? "warn"
                          : "default";
                    const valueColor =
                      status === "critical"
                        ? "text-status-danger-fg"
                        : status === "low"
                          ? "text-status-warn-fg"
                          : "text-ds-text-1";
                    return (
                      <li key={s.id}>
                        <Surface
                          elevation={1}
                          padding="sm"
                          className={cn(
                            "relative",
                            status !== "ok" && [
                              "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r",
                              variant === "danger"
                                ? "before:bg-status-danger"
                                : "before:bg-status-warn",
                            ],
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-ds-text-1 truncate">
                                {variantLabel(s)}
                              </p>
                              <p className="mt-0.5 text-[12px] text-ds-text-3">
                                Mínimo:{" "}
                                <span className="ds-num">
                                  {s.variant.minStock || "—"}
                                </span>
                                {s.avgCost != null
                                  ? ` · Costo: $${Number(s.avgCost).toLocaleString("es-CL")}`
                                  : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={cn(
                                  "font-display text-2xl font-bold leading-none ds-num",
                                  valueColor,
                                )}
                              >
                                {s.quantity}
                              </p>
                              {status !== "ok" && (
                                <Tag
                                  variant={status === "critical" ? "danger" : "warn"}
                                  size="sm"
                                  className="mt-1.5"
                                >
                                  {STATUS_LABEL[status]}
                                </Tag>
                              )}
                            </div>
                          </div>
                        </Surface>
                      </li>
                    );
                  })}
                </ul>

                {/* Desktop: tabla */}
                <div className="hidden sm:block">
                  <DataTable
                    columns={columns}
                    rows={items}
                    rowKey={(r) => r.id}
                    rowVariant={(r) => {
                      const s = getStatus(r.quantity, r.variant.minStock);
                      return s === "critical"
                        ? "danger"
                        : s === "low"
                          ? "warn"
                          : "default";
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
