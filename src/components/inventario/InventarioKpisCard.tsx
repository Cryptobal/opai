"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, UserRoundCheck, Building2, Package, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StockAlert = {
  type: "critical" | "low";
  label: string;
  warehouse: string;
  quantity: number;
  minStock: number;
};

type KpisData = {
  byGuardia: { guardiaId: string; guardiaName: string; totalCost: number }[];
  byInstallation: {
    installationId: string;
    installationName: string;
    totalCost: number;
  }[];
  summary: {
    totalUniformesAsignados: number;
    totalActivosAsignados: number;
    totalGeneral: number;
  };
  stock?: {
    totalValue: number;
    totalItems: number;
    outOfStockCount: number;
    belowMinimumCount: number;
    alerts: StockAlert[];
  };
};

export function InventarioKpisCard() {
  const [data, setData] = useState<KpisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ops/inventario/kpis")
      .then((r) => r.json())
      .then((d) => {
        if (d?.summary) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">Cargando KPIs...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const hasCosts = data.summary.totalGeneral > 0;
  const stockData = data.stock;
  const hasAlerts = stockData && (stockData.outOfStockCount > 0 || stockData.belowMinimumCount > 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n);

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        {/* Stock alerts banner */}
        {hasAlerts && (
          <Link href="/ops/inventario/stock" className="block">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 hover:bg-red-500/10 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  Alertas de stock
                </span>
              </div>
              <div className="flex gap-3 flex-wrap">
                {stockData.outOfStockCount > 0 && (
                  <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                    {stockData.outOfStockCount} agotado{stockData.outOfStockCount > 1 ? "s" : ""}
                  </span>
                )}
                {stockData.belowMinimumCount > 0 && (
                  <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                    {stockData.belowMinimumCount} bajo mínimo
                  </span>
                )}
              </div>
              {stockData.alerts.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {stockData.alerts.slice(0, 5).map((a, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className={a.type === "critical" ? "text-red-500 font-medium" : "text-amber-500 font-medium"}>
                        {a.type === "critical" ? "AGOTADO" : `${a.quantity}/${a.minStock}`}
                      </span>
                      {" "}{a.label} · {a.warehouse}
                    </li>
                  ))}
                  {stockData.alerts.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      + {stockData.alerts.length - 5} más...
                    </li>
                  )}
                </ul>
              )}
            </div>
          </Link>
        )}

        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            Costeo y KPIs
          </h3>
          <Link href="/ops/inventario/entregas">
            <Button variant="ghost" size="sm">
              Ver entregas
            </Button>
          </Link>
        </div>

        {/* Stock value + cost KPIs */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Costo total asignado
            </p>
            <p className="text-xl font-bold">
              {hasCosts ? formatCurrency(data.summary.totalGeneral) : "Sin costos"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Uniformes: {formatCurrency(data.summary.totalUniformesAsignados)}
              {data.summary.totalActivosAsignados > 0 &&
                ` · Activos: ${formatCurrency(data.summary.totalActivosAsignados)}`}
            </p>
          </div>
          {stockData && (
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Valor en bodega
              </p>
              <p className="text-xl font-bold">
                {stockData.totalValue > 0 ? formatCurrency(stockData.totalValue) : "Sin stock"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stockData.totalItems} unidades en stock
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 min-h-[2rem]">
          {data.byGuardia.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <UserRoundCheck className="h-3.5 w-3.5" />
                Top por guardia
              </p>
              <ul className="space-y-1 text-sm">
                {data.byGuardia.slice(0, 5).map((g) => (
                  <li key={g.guardiaId} className="flex justify-between">
                    <span className="truncate">{g.guardiaName}</span>
                    <span className="font-medium shrink-0 ml-2">
                      {formatCurrency(g.totalCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.byInstallation.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Top por instalación
              </p>
              <ul className="space-y-1 text-sm">
                {data.byInstallation.slice(0, 5).map((i) => (
                  <li key={i.installationId} className="flex justify-between">
                    <Link
                      href={`/crm/installations/${i.installationId}`}
                      className="truncate hover:underline"
                    >
                      {i.installationName}
                    </Link>
                    <span className="font-medium shrink-0 ml-2">
                      {formatCurrency(i.totalCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
