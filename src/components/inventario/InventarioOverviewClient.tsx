"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Loader2,
  Package,
  Settings2,
  Truck,
  UserRoundCheck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpaiPageHero } from "@/components/opai";
import { KpiCard, Pill, StatusDot } from "@/components/opai/conocimiento/_primitives";
import { InventarioTransferDialog } from "@/components/inventario/InventarioTransferDialog";
import { cn } from "@/lib/utils";

interface OverviewData {
  counts: {
    products: number;
    warehouses: number;
    deliveriesLast30d: number;
    transfersLast30d: number;
  };
  summary: {
    totalUniformesAsignados: number;
    totalActivosAsignados: number;
    totalGeneral: number;
  };
  stock: {
    totalValue: number;
    totalItems: number;
    outOfStockCount: number;
    belowMinimumCount: number;
  };
  topByGuardia: { guardiaId: string; guardiaName: string; totalCost: number }[];
  topByInstallation: {
    installationId: string;
    installationName: string;
    totalCost: number;
  }[];
  recentMovements: {
    id: string;
    type: string;
    date: string;
    fromWarehouse: string | null;
    toWarehouse: string | null;
    guardiaName: string | null;
    installationName: string | null;
    lineCount: number;
    totalUnits: number;
    summary: string;
    createdByName: string | null;
    confirmationStatus: string | null;
  }[];
  alerts: {
    type: "critical" | "low";
    label: string;
    warehouse: string;
    quantity: number;
    minStock: number;
  }[];
}

interface Props {
  canEdit: boolean;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const formatRelativeDate = (iso: string) => {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
};

export function InventarioOverviewClient({ canEdit }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ops/inventario/overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data) setData(res.data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stockThreshold =
    data?.stock?.outOfStockCount ?? 0 > 0
      ? "danger"
      : (data?.stock.belowMinimumCount ?? 0) > 0
        ? "warn"
        : "ok";

  return (
    <section className="relative w-full pb-32">
      <OpaiPageHero
        eyebrow={["Operaciones", "Inventario"]}
        title="Tu operación"
        subtitle="en una sola vista"
        description="Stock, movimientos y costo asignado de uniformes y activos. Toca cualquier acceso arriba o desde el menú inferior para entrar al detalle."
        actions={
          canEdit ? (
            <>
              <InventarioTransferDialog
                trigger={
                  <Button size="sm" variant="outline" className="gap-2">
                    <ArrowLeftRight className="h-4 w-4" />
                    <span className="hidden sm:inline">Mover stock</span>
                  </Button>
                }
              />
              <Link href="/ops/inventario/configuracion">
                <Button size="sm" variant="outline" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Configuración</span>
                </Button>
              </Link>
            </>
          ) : null
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5 relative">
        <KpiCard
          label="Productos activos"
          value={loading ? "—" : String(data?.counts.products ?? 0)}
          rightSlot={<Package className="h-3.5 w-3.5 text-muted-foreground/60" />}
          hint={
            data
              ? `${data.counts.warehouses} ${data.counts.warehouses === 1 ? "bodega" : "bodegas"}`
              : undefined
          }
        />
        <KpiCard
          label="Valor en bodega"
          value={
            loading
              ? "—"
              : data && data.stock.totalValue > 0
                ? formatCurrency(data.stock.totalValue)
                : "$0"
          }
          threshold="ok"
          hint={data ? `${data.stock.totalItems.toLocaleString("es-CL")} unidades` : undefined}
          rightSlot={<WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground/60" />}
        />
        <KpiCard
          label="Asignado a guardias"
          value={
            loading
              ? "—"
              : data && data.summary.totalGeneral > 0
                ? formatCurrency(data.summary.totalGeneral)
                : "$0"
          }
          hint={
            data
              ? `${data.counts.deliveriesLast30d} ${data.counts.deliveriesLast30d === 1 ? "entrega" : "entregas"} 30 d`
              : undefined
          }
          rightSlot={<UserRoundCheck className="h-3.5 w-3.5 text-muted-foreground/60" />}
        />
        <KpiCard
          label="Alertas de stock"
          value={
            loading
              ? "—"
              : data
                ? String(
                    (data.stock.outOfStockCount ?? 0) + (data.stock.belowMinimumCount ?? 0),
                  )
                : "0"
          }
          threshold={stockThreshold}
          hint={
            data && (data.stock.outOfStockCount > 0 || data.stock.belowMinimumCount > 0)
              ? `${data.stock.outOfStockCount} agotados · ${data.stock.belowMinimumCount} bajo mínimo`
              : "todo en orden"
          }
          rightSlot={
            data && (data.stock.outOfStockCount > 0 || data.stock.belowMinimumCount > 0) ? (
              <StatusDot threshold={stockThreshold} pulse={data.stock.outOfStockCount > 0} />
            ) : undefined
          }
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}

      {!loading && data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Movimientos recientes */}
          <div className="card-mock p-4 lg:col-span-2 relative">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Movimientos recientes</h2>
                <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                  Últimas {data.recentMovements.length} acciones del módulo
                </p>
              </div>
              <Link
                href="/ops/inventario/entregas"
                className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data.recentMovements.length === 0 ? (
              <p className="rounded-md border border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground/70">
                Aún no hay movimientos. Crea una entrega o registra una compra.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {data.recentMovements.map((m) => {
                  const isDelivery = m.type === "delivery";
                  const isTransfer = m.type === "transfer";
                  const Icon = isTransfer
                    ? ArrowLeftRight
                    : isDelivery
                      ? UserRoundCheck
                      : Truck;
                  const variant: "ok" | "warn" | "neutral" =
                    m.confirmationStatus === "confirmed"
                      ? "ok"
                      : isDelivery
                        ? "warn"
                        : "neutral";
                  return (
                    <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            isTransfer
                              ? "bg-blue-500/10 text-blue-300"
                              : isDelivery
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-muted/40 text-foreground/70",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium truncate">
                              {isTransfer
                                ? `${m.fromWarehouse ?? "—"} → ${m.toWarehouse ?? "—"}`
                                : (m.guardiaName ?? "Movimiento")}
                            </p>
                            <Pill variant={variant === "neutral" ? "neutral" : variant}>
                              {m.totalUnits} u.
                            </Pill>
                          </div>
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate font-mono">
                            {formatRelativeDate(m.date)}
                            {m.installationName ? ` · ${m.installationName}` : ""}
                            {m.createdByName ? ` · ${m.createdByName}` : ""}
                          </p>
                          {m.summary && (
                            <p className="text-[11px] text-foreground/70 mt-0.5 truncate">
                              {m.summary}
                              {m.lineCount > 2 && ` +${m.lineCount - 2}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Alertas de stock */}
          <div className="card-mock p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  Alertas de stock
                </h2>
                <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                  {data.stock.outOfStockCount} agotados · {data.stock.belowMinimumCount} bajo mínimo
                </p>
              </div>
              <Link
                href="/ops/inventario/stock"
                className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                Ver stock <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {data.alerts.length === 0 ? (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-center text-xs text-emerald-300">
                Todo en orden. No hay alertas activas.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {data.alerts.map((a, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-md border px-2.5 py-2",
                      a.type === "critical"
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-amber-500/30 bg-amber-500/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{a.label}</span>
                      <Pill variant={a.type === "critical" ? "danger" : "warn"}>
                        {a.type === "critical" ? "Agotado" : `${a.quantity}/${a.minStock}`}
                      </Pill>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate font-mono">
                      {a.warehouse}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Top por guardia */}
          {data.topByGuardia.length > 0 && (
            <div className="card-mock p-4 relative">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">Top por guardia</h2>
                  <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">Costo asignado vigente</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {data.topByGuardia.map((g) => (
                  <li
                    key={g.guardiaId}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2"
                  >
                    <span className="text-xs truncate">{g.guardiaName}</span>
                    <span className="text-xs font-semibold tabular-nums shrink-0">
                      {formatCurrency(g.totalCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top por instalación */}
          {data.topByInstallation.length > 0 && (
            <div className="card-mock p-4 lg:col-span-2 relative">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                    Top por instalación
                  </h2>
                  <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">Costo asignado vigente</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {data.topByInstallation.map((i) => (
                  <li
                    key={i.installationId}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2"
                  >
                    <Link
                      href={`/crm/installations/${i.installationId}`}
                      className="text-xs truncate hover:underline"
                    >
                      {i.installationName}
                    </Link>
                    <span className="text-xs font-semibold tabular-nums">
                      {formatCurrency(i.totalCost)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
