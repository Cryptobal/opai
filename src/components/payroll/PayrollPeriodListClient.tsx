"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ChevronRight } from "lucide-react";

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
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);

  const selectClass = "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Períodos</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo período
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : periods.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay períodos creados. Crea el primero para comenzar a procesar liquidaciones.
          </p>
        ) : (
          <div className="space-y-2">
            {periods.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => router.push(`/payroll/periodos/${p.id}`)}
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
              </div>
            ))}
          </div>
        )}
      </CardContent>

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
    </Card>
  );
}
