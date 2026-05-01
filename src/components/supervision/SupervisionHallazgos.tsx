"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/opai-ds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Ticket,
  MoreVertical,
  Repeat2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ─── Types ─── */

type FindingItem = {
  id: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  installationId: string;
  ticketId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  occurrenceCount?: number;
  firstDetectedAt?: string | null;
  lastDetectedAt?: string | null;
  installation: { id?: string; name: string };
  visit: { checkInAt: string; supervisor: { name: string } };
  ticket: { id: string; code: string; status: string; createdAt?: string | null } | null;
  guard: { persona: { firstName: string; lastName: string } } | null;
  tipoDoc?: { id: string; codigo: string; nombre: string; capa: string } | null;
};

type HallazgosData = {
  items: FindingItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  kpis: {
    totalOpen: number;
    totalCritical: number;
    avgResolutionHours: number | null;
  };
};

/* ─── Label maps ─── */

const SEVERITY_CONFIG: Record<
  string,
  { label: string; variant: "destructive" | "warning" | "secondary" }
> = {
  critical: { label: "Crítico", variant: "destructive" },
  major: { label: "Mayor", variant: "warning" },
  minor: { label: "Menor", variant: "secondary" },
};

const CATEGORY_LABELS: Record<string, string> = {
  personal: "Personal",
  infrastructure: "Infraestructura",
  documentation: "Documentación",
  operational: "Operativo",
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "warning" | "default" | "success" | "secondary";
  }
> = {
  open: { label: "Abierto", variant: "warning" },
  in_progress: { label: "En progreso", variant: "default" },
  resolved: { label: "Resuelto", variant: "success" },
  verified: { label: "Verificado", variant: "success" },
};

/* ─── Component ─── */

export function SupervisionHallazgos() {
  const [data, setData] = useState<HallazgosData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState("open");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);

  const fetchHallazgos = useCallback(
    async (pg = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("status", statusFilter);
        if (severityFilter !== "all") params.set("severity", severityFilter);
        if (categoryFilter !== "all") params.set("category", categoryFilter);
        params.set("page", pg.toString());
        params.set("limit", "25");

        const res = await fetch(`/api/ops/supervision/hallazgos?${params}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          setPage(pg);
        }
      } catch {
        toast.error("Error al cargar hallazgos");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, severityFilter, categoryFilter],
  );

  useEffect(() => {
    fetchHallazgos(1);
  }, [fetchHallazgos]);

  const handleStatusChange = async (
    finding: FindingItem,
    newStatus: string,
  ) => {
    try {
      const res = await fetch(
        `/api/ops/supervision/installation-findings/${finding.installationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingId: finding.id, status: newStatus }),
        },
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Estado actualizado");
        fetchHallazgos(page);
      } else {
        toast.error(json.error || "Error al actualizar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="space-y-4">
      {/* ── KPIs ── */}
      <StatGrid lgCols={3}>
        <Stat
          label="Abiertos"
          value={data?.kpis.totalOpen ?? 0}
          icon={AlertTriangle}
        />
        <Stat
          label="Críticos"
          value={data?.kpis.totalCritical ?? 0}
          icon={AlertTriangle}
          variant="danger"
        />
        <Stat
          label="Resolución promedio"
          value={
            data?.kpis.avgResolutionHours != null
              ? `${data.kpis.avgResolutionHours}h`
              : "—"
          }
          icon={Clock}
        />
      </StatGrid>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Severity pills */}
        {(["all", "critical", "major", "minor"] as const).map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => setSeverityFilter(sev)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              severityFilter === sev
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-muted-foreground border-border hover:bg-accent/50",
            )}
          >
            {sev === "all" ? "Todas" : (SEVERITY_CONFIG[sev]?.label ?? sev)}
          </button>
        ))}

        <div className="h-4 w-px bg-border mx-1" />

        {/* Status pills */}
        {(["open", "in_progress", "resolved", "all"] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              statusFilter === st
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-muted-foreground border-border hover:bg-accent/50",
            )}
          >
            {st === "all"
              ? "Todos"
              : st === "open"
                ? "Abiertos"
                : (STATUS_CONFIG[st]?.label ?? st)}
          </button>
        ))}

        <div className="h-4 w-px bg-border mx-1" />

        {/* Category dropdown */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Finding list ── */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin hallazgos con los filtros seleccionados
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((f) => {
            const sevCfg = SEVERITY_CONFIG[f.severity];
            const stCfg = STATUS_CONFIG[f.status];

            const occurrences = f.occurrenceCount ?? 1;
            const firstAt = f.firstDetectedAt ?? f.createdAt;
            const lastAt = f.lastDetectedAt ?? f.createdAt;
            const openedAt = f.ticket?.createdAt ?? firstAt;
            const daysOpen = openedAt
              ? Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(openedAt).getTime()) / (1000 * 60 * 60 * 24),
                  ),
                )
              : null;
            const instId = f.installation.id ?? f.installationId;

            return (
              <Card key={f.id} className="p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Row 1: badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={sevCfg?.variant ?? "secondary"}
                        className="text-[10px]"
                      >
                        {sevCfg?.label ?? f.severity}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {CATEGORY_LABELS[f.category] ?? f.category}
                      </Badge>
                      <Badge
                        variant={stCfg?.variant ?? "secondary"}
                        className="text-[10px]"
                      >
                        {stCfg?.label ?? f.status}
                      </Badge>
                      {f.ticket && (
                        <Link href={`/ops/tickets/${f.ticket.id}`}>
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-1 cursor-pointer hover:bg-accent"
                          >
                            <Ticket className="h-3 w-3" />
                            {f.ticket.code}
                          </Badge>
                        </Link>
                      )}
                      {occurrences > 1 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1 border-status-warn-border text-status-warn-fg bg-status-warn-soft"
                        >
                          <Repeat2 className="h-3 w-3" />
                          {occurrences} visitas
                        </Badge>
                      )}
                      {f.tipoDoc && (
                        <Badge variant="outline" className="text-[10px] text-status-info-fg border-status-info-border bg-status-info-soft">
                          {f.tipoDoc.nombre}
                        </Badge>
                      )}
                    </div>

                    {/* Row 2: description */}
                    <p className="text-sm">{f.description}</p>

                    {/* Row 3: metadata */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <Link
                        href={`/crm/installations/${instId}?tab=docs`}
                        className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {f.installation.name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      {daysOpen !== null && (
                        <span>
                          Abierto hace <strong>{daysOpen}</strong> {daysOpen === 1 ? "día" : "días"}
                        </span>
                      )}
                      <span>1ª: {formatDate(firstAt)}</span>
                      {occurrences > 1 && <span>Última: {formatDate(lastAt)}</span>}
                      {f.guard && <span>{f.guard.persona.firstName} {f.guard.persona.lastName}</span>}
                      <span>{f.visit.supervisor.name}</span>
                    </div>
                  </div>

                  {/* Status change action */}
                  {f.status !== "resolved" && f.status !== "verified" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {f.status === "open" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(f, "in_progress")
                            }
                          >
                            Marcar en progreso
                          </DropdownMenuItem>
                        )}
                        {(f.status === "open" ||
                          f.status === "in_progress") && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(f, "resolved")}
                          >
                            Marcar resuelto
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {data.total} hallazgo{data.total !== 1 ? "s" : ""} en total
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => fetchHallazgos(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs px-2">
              {page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= data.totalPages}
              onClick={() => fetchHallazgos(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
