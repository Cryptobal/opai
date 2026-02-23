"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StockRecord = {
  id: string;
  quantity: number;
  avgCost: number | null;
  warehouse: { name: string; type: string };
  variant: {
    product: { name: string };
    size: { sizeCode: string } | null;
  };
};

export function InventarioStockClient() {
  const [stock, setStock] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/ops/inventario/stock")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStock(data.filter((s: StockRecord) => s.quantity > 0));
        else setError(data?.error || "Error al cargar stock.");
      })
      .catch((e) => {
        console.error(e);
        setError("No se pudo conectar al servidor.");
      })
      .finally(() => setLoading(false));
  }, []);

  const byWarehouse = stock.reduce<Record<string, StockRecord[]>>((acc, s) => {
    const key = s.warehouse.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const variantLabel = (s: StockRecord) =>
    s.variant.size
      ? `${s.variant.product.name} ${s.variant.size.sizeCode}`
      : s.variant.product.name;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock por bodega</CardTitle>
        <CardDescription>
          Solo se muestran ítems con cantidad mayor a cero.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </div>
        ) : stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay stock. Registra una compra para ver el inventario.
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(byWarehouse).map(([whName, items]) => (
              <div key={whName}>
                <h3 className="font-semibold mb-2">{whName}</h3>
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 text-xs font-medium">
                    <span>Producto / Talla</span>
                    <span className="text-right">Cantidad</span>
                    <span className="text-right">Costo prom.</span>
                  </div>
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="grid grid-cols-3 gap-2 p-2 border-t text-sm"
                    >
                      <span>{variantLabel(s)}</span>
                      <span className="text-right">{s.quantity}</span>
                      <span className="text-right">
                        {s.avgCost != null
                          ? `$${Number(s.avgCost).toLocaleString("es-CL")}`
                          : "-"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
