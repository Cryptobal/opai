"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  Package,
  Search,
  Warehouse as WarehouseIcon,
} from "lucide-react";
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

const STATUS_META: Record<StockStatus, { label: string; chip: string; row: string; text: string }> = {
  critical: {
    label: "Agotado",
    chip: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
    row: "bg-red-500/[0.04]",
    text: "text-red-600 dark:text-red-400",
  },
  low: {
    label: "Bajo mínimo",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    row: "bg-amber-500/[0.04]",
    text: "text-amber-600 dark:text-amber-400",
  },
  ok: { label: "OK", chip: "", row: "", text: "" },
};

interface Props {
  canEdit: boolean;
}

export function InventarioStockClient({ canEdit }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const warehouseIdFromUrl = searchParams.get("warehouseId") ?? "";

  const [stock, setStock] = useState<StockRecord[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "alerts">("all");
  const [search, setSearch] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouseIdFromUrl);

  useEffect(() => {
    setSelectedWarehouseId(warehouseIdFromUrl);
  }, [warehouseIdFromUrl]);

  useEffect(() => {
    fetch("/api/ops/inventario/warehouses")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setWarehouses(
            data.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })),
          );
        }
      })
      .catch(console.error);
  }, []);

  const setWarehouseFilter = (id: string) => {
    setSelectedWarehouseId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("warehouseId", id);
    else params.delete("warehouseId");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = selectedWarehouseId ? `?warehouseId=${selectedWarehouseId}` : "";
    fetch(`/api/ops/inventario/stock${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStock(data);
        else setError(data?.error || "Error al cargar stock.");
      })
      .catch((e) => {
        console.error(e);
        setError("No se pudo conectar al servidor.");
      })
      .finally(() => setLoading(false));
  }, [selectedWarehouseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const variantLabel = (s: StockRecord) =>
    s.variant.size
      ? `${s.variant.product.name} ${s.variant.size.sizeCode}`
      : s.variant.product.name;

  const filtered = useMemo(() => {
    let result = stock;
    if (filter === "alerts") {
      result = result.filter((s) => getStatus(s.quantity, s.variant.minStock) !== "ok");
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => variantLabel(s).toLowerCase().includes(q));
    }
    return result;
  }, [stock, filter, search]);

  const byWarehouse = useMemo(() => {
    return filtered.reduce<Record<string, StockRecord[]>>((acc, s) => {
      const key = s.warehouse.name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {});
  }, [filtered]);

  const criticalCount = stock.filter(
    (s) => getStatus(s.quantity, s.variant.minStock) === "critical",
  ).length;
  const lowCount = stock.filter((s) => getStatus(s.quantity, s.variant.minStock) === "low").length;
  const totalUnits = stock.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <Card>
      <CardHeader className="space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              Stock por bodega
            </CardTitle>
            <CardDescription className="mt-1">
              Niveles actuales de inventario. El stock mínimo se configura en cada producto.
            </CardDescription>
          </div>
          {canEdit && (
            <div className="shrink-0">
              <InventarioTransferDialog onCompleted={fetchData} />
            </div>
          )}
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Variantes</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{stock.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unidades</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{totalUnits.toLocaleString("es-CL")}</p>
          </div>
          <div className={cn("rounded-lg border p-2.5", criticalCount > 0 ? "border-red-500/30 bg-red-500/5" : "bg-muted/30")}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Agotados</p>
            <p className={cn("mt-0.5 text-base font-semibold tabular-nums", criticalCount > 0 && "text-red-600 dark:text-red-400")}>
              {criticalCount}
            </p>
          </div>
          <div className={cn("rounded-lg border p-2.5", lowCount > 0 ? "border-amber-500/30 bg-amber-500/5" : "bg-muted/30")}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bajo mínimo</p>
            <p className={cn("mt-0.5 text-base font-semibold tabular-nums", lowCount > 0 && "text-amber-600 dark:text-amber-400")}>
              {lowCount}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="pl-8 h-9"
            />
          </div>
          <Select value={selectedWarehouseId || "all"} onValueChange={(v) => setWarehouseFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-full sm:w-56">
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
          <div className="flex gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="h-9 text-xs"
            >
              Todos ({stock.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filter === "alerts" ? "default" : "outline"}
              onClick={() => setFilter("alerts")}
              className="h-9 gap-1 text-xs"
            >
              <AlertTriangle className="h-3 w-3" />
              Alertas ({criticalCount + lowCount})
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando stock…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {filter === "alerts"
                ? "No hay alertas de stock"
                : "Sin stock que mostrar"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "alerts"
                ? "Todo en orden, no hay productos por debajo del mínimo."
                : "Registra una compra para ver el inventario."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(byWarehouse).map(([whName, items]) => {
              const subtotal = items.reduce((sum, s) => sum + s.quantity, 0);
              return (
                <div key={items[0]?.warehouse.id ?? whName}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
                      {whName}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {subtotal.toLocaleString("es-CL")} unid.
                    </span>
                  </div>

                  {/* Mobile: cards */}
                  <div className="space-y-1.5 sm:hidden">
                    {items.map((s) => {
                      const status = getStatus(s.quantity, s.variant.minStock);
                      const meta = STATUS_META[status];
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "rounded-lg border p-3",
                            meta.row,
                            status !== "ok" && "border-l-2 border-l-current",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{variantLabel(s)}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                Mínimo: {s.variant.minStock || "—"}
                                {s.avgCost != null ? ` · Costo: $${Number(s.avgCost).toLocaleString("es-CL")}` : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={cn("text-xl font-bold tabular-nums leading-none", meta.text)}>
                                {s.quantity}
                              </p>
                              {status !== "ok" && (
                                <Badge variant="outline" className={cn("mt-1 text-[10px]", meta.chip)}>
                                  {meta.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: tabla */}
                  <div className="hidden overflow-hidden rounded-lg border sm:block">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="p-2 text-left font-medium">Producto / Talla</th>
                          <th className="p-2 text-right font-medium">Cantidad</th>
                          <th className="p-2 text-right font-medium">Mín</th>
                          <th className="p-2 text-right font-medium">Costo prom.</th>
                          <th className="p-2 text-center font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((s) => {
                          const status = getStatus(s.quantity, s.variant.minStock);
                          const meta = STATUS_META[status];
                          return (
                            <tr key={s.id} className={cn("border-t", meta.row)}>
                              <td className="p-2 truncate">{variantLabel(s)}</td>
                              <td className={cn("p-2 text-right font-semibold tabular-nums", meta.text)}>
                                {s.quantity}
                              </td>
                              <td className="p-2 text-right tabular-nums text-muted-foreground">
                                {s.variant.minStock || "-"}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {s.avgCost != null
                                  ? `$${Number(s.avgCost).toLocaleString("es-CL")}`
                                  : "-"}
                              </td>
                              <td className="p-2 text-center">
                                {status !== "ok" && (
                                  <Badge variant="outline" className={cn("text-[10px]", meta.chip)}>
                                    {meta.label}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
