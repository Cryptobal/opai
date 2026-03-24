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
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

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

const STATUS_STYLES: Record<StockStatus, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", label: "Agotado" },
  low: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "Bajo mínimo" },
  ok: { bg: "", text: "", label: "" },
};

export function InventarioStockClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const warehouseIdFromUrl = searchParams.get("warehouseId") ?? "";

  const [stock, setStock] = useState<StockRecord[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "alerts">("all");
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
            data.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))
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

  const filtered = useMemo(
    () =>
      filter === "alerts"
        ? stock.filter((s) => getStatus(s.quantity, s.variant.minStock) !== "ok")
        : stock,
    [stock, filter]
  );

  const byWarehouse = useMemo(() => {
    return filtered.reduce<Record<string, StockRecord[]>>((acc, s) => {
      const key = s.warehouse.name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {});
  }, [filtered]);

  // Summary counts (respecta filtro de bodega actual)
  const criticalCount = stock.filter((s) => getStatus(s.quantity, s.variant.minStock) === "critical").length;
  const lowCount = stock.filter((s) => getStatus(s.quantity, s.variant.minStock) === "low").length;

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Stock por bodega</CardTitle>
            <CardDescription>
              Niveles actuales de inventario. El stock mínimo se configura en cada producto.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end w-full lg:w-auto">
            <div className="flex flex-col gap-1.5 min-w-0 flex-1 sm:max-w-xs">
              <Label htmlFor="inv-stock-warehouse" className="text-xs text-muted-foreground">
                Bodega
              </Label>
              <select
                id="inv-stock-warehouse"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedWarehouseId}
                onChange={(e) => setWarehouseFilter(e.target.value)}
              >
                <option value="">Todas las bodegas</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  filter === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-muted"
                }`}
              >
                Todos ({stock.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("alerts")}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  filter === "alerts"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-muted"
                }`}
              >
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Alertas ({criticalCount + lowCount})
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Alert summary */}
        {(criticalCount > 0 || lowCount > 0) && (
          <div className="flex gap-3 mb-4">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {criticalCount} agotado{criticalCount > 1 ? "s" : ""}
              </div>
            )}
            {lowCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {lowCount} bajo mínimo
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "alerts"
              ? "No hay alertas de stock. Todo en orden."
              : "No hay stock. Registra una compra para ver el inventario."}
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(byWarehouse).map(([whName, items]) => (
              <div key={items[0]?.warehouse.id ?? whName}>
                <h3 className="font-semibold mb-2">{whName}</h3>
                <div className="rounded-lg border overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-12 gap-2 p-2 bg-muted/50 text-xs font-medium">
                      <span className="col-span-4">Producto / Talla</span>
                      <span className="col-span-2 text-right">Cantidad</span>
                      <span className="col-span-2 text-right">Mín</span>
                      <span className="col-span-2 text-right">Costo prom.</span>
                      <span className="col-span-2 text-center">Estado</span>
                    </div>
                    {items.map((s) => {
                      const status = getStatus(s.quantity, s.variant.minStock);
                      const styles = STATUS_STYLES[status];

                      return (
                        <div
                          key={s.id}
                          className={`grid grid-cols-12 gap-2 p-2 border-t text-sm items-center ${styles.bg}`}
                        >
                          <span className="col-span-4 truncate">{variantLabel(s)}</span>
                          <span className={`col-span-2 text-right font-medium tabular-nums ${status === "critical" ? "text-red-600 dark:text-red-400" : status === "low" ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {s.quantity}
                          </span>
                          <span className="col-span-2 text-right tabular-nums text-muted-foreground">
                            {s.variant.minStock || "-"}
                          </span>
                          <span className="col-span-2 text-right tabular-nums">
                            {s.avgCost != null
                              ? `$${Number(s.avgCost).toLocaleString("es-CL")}`
                              : "-"}
                          </span>
                          <span className="col-span-2 text-center">
                            {status !== "ok" && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${styles.bg} ${styles.text} font-medium`}>
                                {styles.label}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
