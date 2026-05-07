"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Package,
  Settings2,
  Truck,
  UserRoundCheck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHero,
  KPICard,
  KPIGrid,
  Tag,
  Surface,
  SectionHeader,
  IconBubble,
  EmptyState,
  Spinner,
  StatusDot,
} from "@/components/opai-ds";
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
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

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

  const stockAlertsTotal =
    (data?.stock.outOfStockCount ?? 0) + (data?.stock.belowMinimumCount ?? 0);
  const stockVariant: "ok" | "warn" | "danger" =
    (data?.stock.outOfStockCount ?? 0) > 0
      ? "danger"
      : (data?.stock.belowMinimumCount ?? 0) > 0
        ? "warn"
        : "ok";

  return (
    <section className="relative w-full pb-32 space-y-6 ds-page-enter">
      <PageHero
        icon={Package}
        iconTone="emerald"
        title="Tu operación"
        subtitle="en una sola vista"
        description="Stock, movimientos y costo asignado de uniformes y activos. Toca cualquier acceso arriba o desde el menú inferior para entrar al detalle."
        actions={
          canEdit ? (
            <>
              <InventarioTransferDialog
                trigger={
                  <Button size="sm" variant="outline" className="gap-2 h-10">
                    <ArrowLeftRight className="h-4 w-4" />
                    <span className="hidden sm:inline">Mover stock</span>
                  </Button>
                }
              />
              <Link href="/ops/inventario/configuracion">
                <Button size="sm" variant="outline" className="gap-2 h-10">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Configuración</span>
                </Button>
              </Link>
            </>
          ) : null
        }
      />

      {/* KPIs — 4 cards con IconTile prominente arriba (KPICard, no Stat). */}
      <KPIGrid lgCols={4}>
        <KPICard
          label="Productos activos"
          value={loading ? "—" : (data?.counts.products ?? 0)}
          animate={!loading}
          icon={Package}
          iconTone="emerald"
          hint={
            data
              ? `${data.counts.warehouses} ${data.counts.warehouses === 1 ? "bodega" : "bodegas"}`
              : undefined
          }
        />
        <KPICard
          label="Valor en bodega"
          value={
            loading
              ? "—"
              : data && data.stock.totalValue > 0
                ? formatCurrency(data.stock.totalValue)
                : "$0"
          }
          variant="brand"
          icon={WarehouseIcon}
          iconTone="emerald"
          hint={
            data
              ? `${data.stock.totalItems.toLocaleString("es-CL")} unidades`
              : undefined
          }
        />
        <KPICard
          label="Asignado a guardias"
          value={
            loading
              ? "—"
              : data && data.summary.totalGeneral > 0
                ? formatCurrency(data.summary.totalGeneral)
                : "$0"
          }
          icon={UserRoundCheck}
          iconTone="emerald"
          hint={
            data
              ? `${data.counts.deliveriesLast30d} ${data.counts.deliveriesLast30d === 1 ? "entrega" : "entregas"} 30 d`
              : undefined
          }
        />
        <KPICard
          label="Alertas de stock"
          value={loading ? "—" : stockAlertsTotal}
          animate={!loading}
          variant={stockAlertsTotal > 0 ? stockVariant : "default"}
          icon={AlertTriangle}
          iconVariant={
            stockAlertsTotal === 0
              ? "ok"
              : stockVariant === "danger"
                ? "danger"
                : "warn"
          }
          hint={
            data && stockAlertsTotal > 0
              ? `${data.stock.outOfStockCount} agotados · ${data.stock.belowMinimumCount} bajo mínimo`
              : "todo en orden"
          }
        />
      </KPIGrid>

      {loading && <Spinner block label="Cargando información…" />}

      {!loading && data && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Movimientos recientes */}
          <Surface elevation={1} padding="md" className="lg:col-span-2">
            <SectionHeader
              title="Movimientos recientes"
              hint={`Últimas ${data.recentMovements.length} acciones del módulo`}
              actions={
                <Link
                  href="/ops/inventario/entregas"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-colors duration-150"
                >
                  Ver todas <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />

            {data.recentMovements.length === 0 ? (
              <EmptyState
                compact
                icon={Truck}
                title="Aún no hay movimientos"
                description="Crea una entrega o registra una compra para empezar a ver el historial aquí."
              />
            ) : (
              <ul className="mt-4 divide-y divide-ds-border-subtle ds-list-cascade">
                {data.recentMovements.map((m) => {
                  const isDelivery = m.type === "delivery";
                  const isTransfer = m.type === "transfer";
                  const Icon = isTransfer ? ArrowLeftRight : isDelivery ? UserRoundCheck : Truck;
                  const bubbleVariant: "info" | "ok" | "neutral" = isTransfer
                    ? "info"
                    : isDelivery
                      ? "ok"
                      : "neutral";
                  const tagVariant: "ok" | "warn" | "neutral" =
                    m.confirmationStatus === "confirmed"
                      ? "ok"
                      : isDelivery
                        ? "warn"
                        : "neutral";

                  return (
                    <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                        <IconBubble icon={Icon} variant={bubbleVariant} size="md" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-ds-text-1 truncate">
                              {isTransfer
                                ? `${m.fromWarehouse ?? "—"} → ${m.toWarehouse ?? "—"}`
                                : (m.guardiaName ?? "Movimiento")}
                            </p>
                            <Tag variant={tagVariant} size="sm">
                              {m.totalUnits} u.
                            </Tag>
                          </div>
                          <p className="mt-0.5 text-xs font-mono text-ds-text-4 truncate">
                            {formatRelativeDate(m.date)}
                            {m.installationName ? ` · ${m.installationName}` : ""}
                            {m.createdByName ? ` · ${m.createdByName}` : ""}
                          </p>
                          {m.summary && (
                            <p className="mt-1 text-sm text-ds-text-3 truncate">
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
          </Surface>

          {/* Alertas de stock */}
          <Surface elevation={1} padding="md">
            <SectionHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-status-warn-fg" />
                  Alertas de stock
                </span>
              }
              hint={`${data.stock.outOfStockCount} agotados · ${data.stock.belowMinimumCount} bajo mínimo`}
              actions={
                <Link
                  href="/ops/inventario/stock"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-colors duration-150"
                >
                  Ver stock <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />

            {data.alerts.length === 0 ? (
              <div className="mt-4 rounded-ds-md border border-status-ok-border bg-status-ok-soft p-4 text-center">
                <p className="text-sm font-medium text-status-ok-fg">
                  Todo en orden
                </p>
                <p className="mt-0.5 text-xs text-status-ok-fg">
                  No hay alertas activas.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2 ds-list-cascade">
                {data.alerts.map((a, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-ds-md border px-3 py-2.5",
                      a.type === "critical"
                        ? "border-status-danger-border bg-status-danger-soft"
                        : "border-status-warn-border bg-status-warn-soft",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusDot
                          kind={a.type === "critical" ? "danger" : "warn"}
                          pulse={a.type === "critical"}
                        />
                        <span className="text-sm font-medium text-ds-text-1 truncate">
                          {a.label}
                        </span>
                      </div>
                      <Tag
                        variant={a.type === "critical" ? "danger" : "warn"}
                        size="sm"
                      >
                        {a.type === "critical" ? "Agotado" : `${a.quantity}/${a.minStock}`}
                      </Tag>
                    </div>
                    <p className="mt-1 text-xs font-mono text-ds-text-4 truncate">
                      {a.warehouse}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          {/* Top por guardia */}
          {data.topByGuardia.length > 0 && (
            <Surface elevation={1} padding="md">
              <SectionHeader title="Top por guardia" hint="Costo asignado vigente" />
              <ul className="mt-4 space-y-1.5 ds-list-cascade">
                {data.topByGuardia.map((g) => (
                  <li
                    key={g.guardiaId}
                    className="flex items-center justify-between gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5"
                  >
                    <span className="text-sm text-ds-text-1 truncate">
                      {g.guardiaName}
                    </span>
                    <span className="text-sm font-mono font-semibold tabular-nums text-ds-text-1 shrink-0">
                      {formatCurrency(g.totalCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>
          )}

          {/* Top por instalación */}
          {data.topByInstallation.length > 0 && (
            <Surface elevation={1} padding="md" className="lg:col-span-2">
              <SectionHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-ds-text-3" />
                    Top por instalación
                  </span>
                }
                hint="Costo asignado vigente"
              />
              <ul className="mt-4 space-y-1.5 ds-list-cascade">
                {data.topByInstallation.map((i) => (
                  <li
                    key={i.installationId}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 transition-colors hover:bg-ds-surface-3"
                  >
                    <Link
                      href={`/crm/installations/${i.installationId}`}
                      className="text-sm text-ds-text-1 truncate hover:underline"
                    >
                      {i.installationName}
                    </Link>
                    <span className="text-sm font-mono font-semibold tabular-nums text-ds-text-1 shrink-0">
                      {formatCurrency(i.totalCost)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-ds-text-4" />
                  </li>
                ))}
              </ul>
            </Surface>
          )}
        </div>
      )}
    </section>
  );
}
