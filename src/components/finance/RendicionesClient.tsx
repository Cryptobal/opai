"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/opai";
import {
  Plus,
  Receipt,
  Car,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ListToolbar } from "@/components/shared/ListToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";

/* ── Types ── */

interface RendicionRow {
  id: string;
  code: string;
  date: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  itemName: string | null;
  costCenterName: string | null;
  submitterName: string;
  submitterId: string;
  createdAt: string;
}

interface ItemOption {
  id: string;
  name: string;
}

interface RendicionesClientProps {
  rendiciones: RendicionRow[];
  items: ItemOption[];
  canSubmit: boolean;
  currentUserId: string;
}

/* ── Constants ── */

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Borrador",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
  SUBMITTED: {
    label: "Enviada",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  IN_APPROVAL: {
    label: "En aprobación",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  APPROVED: {
    label: "Aprobada",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  REJECTED: {
    label: "Rechazada",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  PAID: {
    label: "Pagada",
    className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
};

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  MILEAGE: "Kilometraje",
};

const STATUS_TABS = [
  { value: "ALL", label: "Todos" },
  { value: "DRAFT", label: "Borrador" },
  { value: "SUBMITTED", label: "Enviadas" },
  { value: "IN_APPROVAL", label: "En aprobación" },
  { value: "APPROVED", label: "Aprobadas" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "PAID", label: "Pagadas" },
];

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function RendicionesClient({
  rendiciones,
  items,
  canSubmit,
  currentUserId,
}: RendicionesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [displayView, setDisplayView] = useState<ViewMode>("list");

  const filtered = useMemo(() => {
    let list = rendiciones;

    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (typeFilter !== "ALL") {
      list = list.filter((r) => r.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.submitterName.toLowerCase().includes(q) ||
          r.itemName?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [rendiciones, statusFilter, typeFilter, search]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
  }, []);

  const hasActiveFilters = statusFilter !== "ALL" || typeFilter !== "ALL" || search.trim() !== "";

  const statusFilters = useMemo(() =>
    STATUS_TABS.map((tab) => ({
      key: tab.value,
      label: tab.label,
      count: tab.value === "ALL"
        ? rendiciones.length
        : rendiciones.filter((r) => r.status === tab.value).length,
    })),
  [rendiciones]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar código, descripción..."
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        viewModes={["list", "cards"]}
        activeView={displayView}
        onViewChange={setDisplayView}
        actionSlot={
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los tipos</SelectItem>
                <SelectItem value="PURCHASE">Compra</SelectItem>
                <SelectItem value="MILEAGE">Kilometraje</SelectItem>
              </SelectContent>
            </Select>
            {canSubmit && (
              <Link href="/finanzas/rendiciones/nueva">
                <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Nueva rendición</span>
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} rendición(es)
      </p>

      {/* Table / list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-10 w-10" />}
          title="Sin rendiciones"
          description={
            hasActiveFilters
              ? "No se encontraron rendiciones con los filtros seleccionados."
              : "No hay rendiciones registradas aún."
          }
          action={
            canSubmit && !hasActiveFilters ? (
              <Link href="/finanzas/rendiciones/nueva">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear rendición
                </Button>
              </Link>
            ) : hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      ) : displayView === "list" ? (
        <>
          {/* Table view */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Código
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Tipo
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Ítem
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Monto
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Solicitante
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const statusCfg = STATUS_CONFIG[r.status] ?? {
                        label: r.status,
                        className: "bg-muted text-muted-foreground",
                      };
                      return (
                        <tr
                          key={r.id}
                          onClick={() =>
                            router.push(`/finanzas/rendiciones/${r.id}`)
                          }
                          className="border-b border-border/60 last:border-0 hover:bg-accent/30 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.code}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {format(new Date(r.date), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-xs">
                              {r.type === "MILEAGE" ? (
                                <Car className="h-3 w-3" />
                              ) : (
                                <Receipt className="h-3 w-3" />
                              )}
                              {TYPE_LABELS[r.type] ?? r.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.itemName ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {fmtCLP.format(r.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={statusCfg.className}>
                              {statusCfg.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">
                            {r.submitterName}
                          </td>
                          <td className="px-3 py-2">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile fallback for list view */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => {
              const statusCfg = STATUS_CONFIG[r.status] ?? {
                label: r.status,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <Link key={r.id} href={`/finanzas/rendiciones/${r.id}`}>
                  <div className="rounded-lg border border-border p-3 transition-colors hover:bg-accent/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.code}
                          </span>
                          <Badge className={cn("text-[10px]", statusCfg.className)}>
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {r.description || r.itemName || TYPE_LABELS[r.type]}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{format(new Date(r.date), "dd MMM yyyy", { locale: es })}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            {r.type === "MILEAGE" ? <Car className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                            {TYPE_LABELS[r.type]}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm font-semibold tabular-nums shrink-0">
                        {fmtCLP.format(r.amount)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        /* Cards view */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const statusCfg = STATUS_CONFIG[r.status] ?? {
              label: r.status,
              className: "bg-muted text-muted-foreground",
            };
            return (
              <Link key={r.id} href={`/finanzas/rendiciones/${r.id}`}>
                <div className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30 hover:bg-accent/30">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{r.code}</span>
                    <Badge className={cn("text-[10px]", statusCfg.className)}>
                      {statusCfg.label}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium line-clamp-2">
                    {r.description || r.itemName || TYPE_LABELS[r.type]}
                  </p>
                  <p className="text-lg font-semibold tabular-nums mt-2">
                    {fmtCLP.format(r.amount)}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{format(new Date(r.date), "dd MMM yyyy", { locale: es })}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      {r.type === "MILEAGE" ? <Car className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                      {TYPE_LABELS[r.type]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">
                    {r.submitterName}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
