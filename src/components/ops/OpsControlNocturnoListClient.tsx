"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/opai";
import { useCanEdit } from "@/lib/permissions-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  Moon,
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  Building2,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { ListToolbar } from "@/components/shared/ListToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";

/* ── Types ── */

type ReporteListItem = {
  id: string;
  date: string;
  centralOperatorName: string;
  centralLabel: string | null;
  status: string;
  createdAt: string;
  instalaciones: {
    id: string;
    installationName: string;
    statusInstalacion: string;
    guardiasRequeridos: number;
    guardiasPresentes: number;
  }[];
};

interface Props {
  userRole?: string; // legacy, unused — permissions come from context
}

/* ── Status helpers ── */

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  borrador: { label: "Borrador", color: "bg-zinc-500/15 text-zinc-400", icon: Clock },
  enviado: { label: "Enviado", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  aprobado: { label: "Enviado", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
};

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateShort(dateStr: string): string {
  const dateOnly = dateStr.slice(0, 10);
  const d = new Date(dateOnly + "T12:00:00");
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

/* ── Component ── */

export function OpsControlNocturnoListClient(_props: Props) {
  const router = useRouter();
  const canCreate = useCanEdit("ops", "control_nocturno");
  const [loading, setLoading] = useState(true);
  const [reportes, setReportes] = useState<ReporteListItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [displayView, setDisplayView] = useState<ViewMode>("list");

  // Create form
  const [formDate, setFormDate] = useState(toDateInput(new Date()));
  const [formOperator, setFormOperator] = useState("");
  const [formCentral, setFormCentral] = useState("");

  const fetchReportes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/control-nocturno");
      const json = await res.json();
      if (json.success) setReportes(json.data);
    } catch {
      toast.error("Error al cargar reportes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReportes(); }, [fetchReportes]);

  const filteredReportes = useMemo(() => {
    let result = reportes;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.centralOperatorName.toLowerCase().includes(q) ||
          (r.centralLabel || "").toLowerCase().includes(q) ||
          formatDateShort(r.date).toLowerCase().includes(q)
      );
    }
    return result;
  }, [reportes, statusFilter, search]);

  const statusFilters = useMemo(() => [
    { key: "all", label: "Todos", count: reportes.length },
    { key: "borrador", label: "Borrador", count: reportes.filter((r) => r.status === "borrador").length },
    { key: "enviado", label: "Enviado", count: reportes.filter((r) => r.status === "enviado" || r.status === "aprobado").length },
  ], [reportes]);

  const handleCreate = async () => {
    if (!formDate || !formOperator) {
      toast.error("Completa fecha y nombre del operador");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/ops/control-nocturno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formDate,
          centralOperatorName: formOperator,
          centralLabel: formCentral || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Reporte creado");
        setCreateOpen(false);
        router.push(`/ops/control-nocturno/${json.data.id}`);
      } else {
        toast.error(json.error || "Error al crear");
      }
    } catch {
      toast.error("Error al crear reporte");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar reportes..."
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        viewModes={["list", "cards"]}
        activeView={displayView}
        onViewChange={setDisplayView}
        actionSlot={
          <div className="flex items-center gap-2">
            <Link href="/ops/control-nocturno/kpis">
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0">
                <BarChart3 className="h-4 w-4" />
                <span className="sr-only">KPIs</span>
              </Button>
            </Link>
            {canCreate && (
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" onClick={() => {
                setFormDate(toDateInput(new Date()));
                setFormOperator("");
                setFormCentral("");
                setCreateOpen(true);
              }}>
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nuevo reporte</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Lista de reportes */}
      {filteredReportes.length === 0 ? (
        <EmptyState
          icon={<Moon className="h-10 w-10" />}
          title="Sin reportes nocturnos"
          description={reportes.length === 0
            ? "Crea el primer reporte de control nocturno."
            : "No hay reportes para los filtros seleccionados."}
        />
      ) : displayView === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredReportes.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.borrador;
            const StatusIcon = cfg.icon;
            const totalInst = r.instalaciones.length;
            const conNovedad = r.instalaciones.filter(
              (i) => i.statusInstalacion === "novedad" || i.statusInstalacion === "critico"
            ).length;

            return (
              <div
                key={r.id}
                className="rounded-lg border border-border p-4 cursor-pointer transition-colors hover:border-primary/30 hover:bg-accent/30"
                onClick={() => router.push(`/ops/control-nocturno/${r.id}`)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                    <Moon className="h-4 w-4 text-indigo-400" />
                  </div>
                  <p className="text-sm font-semibold truncate">
                    {formatDateShort(r.date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    {totalInst}
                  </span>
                  {conNovedad > 0 && (
                    <span className="text-[11px] text-amber-400 font-medium">
                      {conNovedad} nov.
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-2">
                  {r.centralOperatorName}
                  {r.centralLabel ? ` · ${r.centralLabel}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReportes.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.borrador;
            const StatusIcon = cfg.icon;
            const totalInst = r.instalaciones.length;
            const conNovedad = r.instalaciones.filter(
              (i) => i.statusInstalacion === "novedad" || i.statusInstalacion === "critico"
            ).length;

            return (
              <Card
                key={r.id}
                className="cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent/60"
                onClick={() => router.push(`/ops/control-nocturno/${r.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                      <Moon className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">
                          {formatDateShort(r.date)}
                        </p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {r.centralOperatorName}
                        {r.centralLabel ? ` · ${r.centralLabel}` : ""}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {totalInst}
                        </span>
                        {conNovedad > 0 && (
                          <span className="text-[11px] text-amber-400 font-medium">
                            {conNovedad} novedad{conNovedad > 1 ? "es" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal crear reporte */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Nuevo reporte nocturno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fecha del turno nocturno</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Operador de central</Label>
              <Input
                placeholder="Ej: Yanetza Gallegos"
                value={formOperator}
                onChange={(e) => setFormOperator(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Central <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                placeholder="Ej: Central II-36"
                value={formCentral}
                onChange={(e) => setFormCentral(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !formDate || !formOperator}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Creando…
                </>
              ) : (
                "Crear reporte"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
