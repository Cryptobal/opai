"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

type StockRecord = {
  id: string;
  quantity: number;
  minStock: number;
  avgCost: number | null;
  warehouse: { name: string; type: string };
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
  const [stock, setStock] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "alerts">("all");

  const fetchData = () => {
    setLoading(true);
    setError(null);
    fetch("/api/ops/inventario/stock")
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  const variantLabel = (s: StockRecord) =>
    s.variant.size
      ? `${s.variant.product.name} ${s.variant.size.sizeCode}`
      : s.variant.product.name;

  const filtered = filter === "alerts"
    ? stock.filter((s) => getStatus(s.quantity, s.variant.minStock) !== "ok")
    : stock;

  const byWarehouse = filtered.reduce<Record<string, StockRecord[]>>((acc, s) => {
    const key = s.warehouse.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  // Summary counts
  const criticalCount = stock.filter((s) => getStatus(s.quantity, s.variant.minStock) === "critical").length;
  const lowCount = stock.filter((s) => getStatus(s.quantity, s.variant.minStock) === "low").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Stock por bodega</CardTitle>
            <CardDescription>
              Niveles actuales de inventario. El stock mínimo se configura en cada producto.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <button
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
              <div key={whName}>
                <h3 className="font-semibold mb-2">{whName}</h3>
                <div className="rounded-lg border overflow-hidden">
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
