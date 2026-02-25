"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ChevronRight, Calendar } from "lucide-react";
import { ListToolbar } from "@/components/shared/ListToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PROCESSING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CLOSED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  PAID: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  PROCESSING: "Procesando",
  CLOSED: "Cerrado",
  PAID: "Pagado",
};

interface Period {
  id: string;
  year: number;
  month: number;
  status: string;
  openedAt: string;
  _count: { liquidaciones: number; attendanceRecords: number };
}

export function PayrollPeriodListClient() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [displayView, setDisplayView] = useState<ViewMode>("list");

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/periodos");
      if (res.ok) {
        const json = await res.json();
        setPeriods(json.data || []);
      }
    } catch (err) {
      console.error("Error loading periods:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const filteredPeriods = useMemo(() => {
    let result = periods;
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        `${MONTHS[p.month - 1]} ${p.year}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [periods, statusFilter, search]);

  const statusFilters = useMemo(() => [
    { key: "all", label: "Todos", count: periods.length },
    { key: "OPEN", label: "Abierto", count: periods.filter((p) => p.status === "OPEN").length },
    { key: "PROCESSING", label: "Procesando", count: periods.filter((p) => p.status === "PROCESSING").length },
    { key: "CLOSED", label: "Cerrado", count: periods.filter((p) => p.status === "CLOSED").length },
    { key: "PAID", label: "Pagado", count: periods.filter((p) => p.status === "PAID").length },
  ], [periods]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/payroll/periodos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: newYear, month: newMonth }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error al crear");
        return;
      }
      setCreateOpen(false);
      await loadPeriods();
    } catch (err) {
      console.error("Error creating period:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar período..."
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        viewModes={["list", "cards"]}
        activeView={displayView}
        onViewChange={setDisplayView}
        actionSlot={
          <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="sr-only">Nuevo período</span>
          </Button>
        }
      />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPeriods.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {periods.length === 0
              ? "No hay períodos creados. Crea el primero para comenzar a procesar liquidaciones."
              : "No hay períodos para los filtros seleccionados."}
          </p>
        </div>
      ) : displayView === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPeriods.map((p) => (
            <Link
              key={p.id}
              href={`/payroll/periodos/${p.id}`}
              className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30 hover:bg-accent/30"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                  <Calendar className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium">
                  {MONTHS[p.month - 1]} {p.year}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STATUS_COLORS[p.status]}>
                  {STATUS_LABELS[p.status] || p.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {p._count.liquidaciones} liquidaciones · {p._count.attendanceRecords} asistencia
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPeriods.map((p) => (
            <Link
              key={p.id}
              href={`/payroll/periodos/${p.id}`}
              className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {MONTHS[p.month - 1]} {p.year}
                  </span>
                  <Badge variant="outline" className={STATUS_COLORS[p.status]}>
                    {STATUS_LABELS[p.status] || p.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p._count.liquidaciones} liquidaciones · {p._count.attendanceRecords} registros asistencia
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo período de pago</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Año</Label>
              <select className={selectClass} value={newYear} onChange={(e) => setNewYear(Number(e.target.value))}>
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mes</Label>
              <select className={selectClass} value={newMonth} onChange={(e) => setNewMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
