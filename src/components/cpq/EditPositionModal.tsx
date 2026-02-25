/**
 * Modal para editar puesto de trabajo CPQ
 * Rediseñado: orden intuitivo, AFP/Salud ocultos (defaults Modelo/Fonasa).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, WEEKDAY_ORDER } from "@/components/cpq/utils";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type { CpqCargo, CpqRol, CpqPuestoTrabajo, CpqPosition } from "@/types/cpq";
import { Calculator } from "lucide-react";

interface EditPositionModalProps {
  quoteId: string;
  position: CpqPosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

const TIME_OPTIONS = [
  "07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30",
  "11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30",
  "15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30",
  "19:00","19:30","20:00",
];

const getShiftHours = (startTime: string, endTime: string) => {
  if (!startTime || !endTime) return null;
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  if (Number.isNaN(startH) || Number.isNaN(startM) || Number.isNaN(endH) || Number.isNaN(endM)) return null;
  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return (endMinutes - startMinutes) / 60;
};

export function EditPositionModal({ quoteId, position, open, onOpenChange, onUpdated }: EditPositionModalProps) {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [cargos, setCargos] = useState<CpqCargo[]>([]);
  const [roles, setRoles] = useState<CpqRol[]>([]);
  const [puestos, setPuestos] = useState<CpqPuestoTrabajo[]>([]);

  const [form, setForm] = useState({
    puestoTrabajoId: position.puestoTrabajoId,
    customName: position.customName || "",
    description: position.description || "",
    weekdays: position.weekdays || [],
    startTime: position.startTime,
    endTime: position.endTime,
    numGuards: position.numGuards,
    numPuestos: position.numPuestos || 1,
    cargoId: position.cargoId,
    rolId: position.rolId,
    baseSalary: Number(position.baseSalary),
    afpName: position.afpName || "modelo",
    healthSystem: position.healthSystem || "fonasa",
    healthPlanPct: position.healthPlanPct || 0.07,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      puestoTrabajoId: position.puestoTrabajoId,
      customName: position.customName || "",
      description: position.description || "",
      weekdays: position.weekdays || [],
      startTime: position.startTime,
      endTime: position.endTime,
      numGuards: position.numGuards,
      numPuestos: position.numPuestos || 1,
      cargoId: position.cargoId,
      rolId: position.rolId,
      baseSalary: Number(position.baseSalary),
      afpName: position.afpName || "modelo",
      healthSystem: position.healthSystem || "fonasa",
      healthPlanPct: position.healthPlanPct || 0.07,
    });
    setPreview(null);
  }, [open, position]);

  useEffect(() => {
    if (open) {
      Promise.all([
        fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
        fetch("/api/cpq/roles?active=true").then((r) => r.json()),
        fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
      ]).then(([c, r, p]) => {
        setCargos(c.data || []);
        setRoles(r.data || []);
        setPuestos(p.data || []);
      }).catch(console.error);
    }
  }, [open]);

  const healthPlanPct = useMemo(() => (form.healthSystem === "fonasa" ? 0.07 : form.healthPlanPct || 0.07), [form.healthPlanPct, form.healthSystem]);
  const shiftHours = useMemo(() => getShiftHours(form.startTime, form.endTime), [form.startTime, form.endTime]);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const res = await fetch("/api/payroll/costing/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_salary_clp: Number(form.baseSalary),
          contract_type: "indefinite",
          afp_name: form.afpName,
          health_system: form.healthSystem,
          health_plan_pct: healthPlanPct,
          assumptions: { include_vacation_provision: true, include_severance_provision: true, vacation_provision_pct: 0.0833, severance_provision_pct: 0.04166 },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "Error");
      setPreview(data.data);
    } catch (err) {
      console.error("Error computing employer cost:", err);
      setPreview(null);
    } finally {
      setCalculating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.weekdays || form.weekdays.length === 0) {
      alert("Debes seleccionar al menos un día de la semana");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, healthPlanPct }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      onOpenChange(false);
      onUpdated?.();
    } catch (err) {
      console.error("Error updating position:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleWeekday = (day: string) => {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day) ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day],
    }));
  };

  const applyWeekdayPreset = (preset: "weekdays" | "weekend" | "all" | "clear") => {
    const map = { clear: [] as string[], all: [...WEEKDAY_ORDER], weekdays: WEEKDAY_ORDER.slice(0, 5), weekend: WEEKDAY_ORDER.slice(5) };
    setForm((prev) => ({ ...prev, weekdays: map[preset] }));
  };

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Puesto de Trabajo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identificacion: Tipo + Cargo / Nombre + Rol */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo de Puesto *</Label>
              <select className={selectClass} value={form.puestoTrabajoId} onChange={(e) => setForm((p) => ({ ...p, puestoTrabajoId: e.target.value }))}>
                <option value="">Selecciona un puesto</option>
                {puestos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cargo *</Label>
              <select className={selectClass} value={form.cargoId} onChange={(e) => setForm((p) => ({ ...p, cargoId: e.target.value }))}>
                <option value="">Selecciona un cargo</option>
                {cargos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre personalizado</Label>
              <Input value={form.customName} onChange={(e) => setForm((p) => ({ ...p, customName: e.target.value }))} className="h-9 bg-background text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rol *</Label>
              <select className={selectClass} value={form.rolId} onChange={(e) => setForm((p) => ({ ...p, rolId: e.target.value }))}>
                <option value="">Selecciona un rol</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Operacion: Horario + Dias + Guardias */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horario</Label>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant={form.startTime === "08:00" && form.endTime === "20:00" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setForm((p) => ({ ...p, startTime: "08:00", endTime: "20:00" }))}>Dia</Button>
                  <Button type="button" size="sm" variant={form.startTime === "20:00" && form.endTime === "08:00" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setForm((p) => ({ ...p, startTime: "20:00", endTime: "08:00" }))}>Noche</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Inicio</Label>
                  <select className={selectClass} value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Termino</Label>
                  <select className={selectClass} value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Jornada: <span className="font-medium text-foreground">{shiftHours === null ? "--" : `${shiftHours % 1 === 0 ? shiftHours.toFixed(0) : shiftHours.toFixed(1)} h`}</span>
              </p>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Días *</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => applyWeekdayPreset("weekdays")}>Lun-Vie</Button>
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => applyWeekdayPreset("weekend")}>Sáb-Dom</Button>
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => applyWeekdayPreset("all")}>Todos</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => applyWeekdayPreset("clear")}>Limpiar</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_ORDER.map((day) => {
                    const active = form.weekdays.includes(day);
                    return (
                      <button key={day} type="button" onClick={() => toggleWeekday(day)} aria-pressed={active} className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${active ? "border-primary/50 bg-primary/15 text-primary" : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}>{day}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guardias</Label>
                <select className="flex h-9 w-20 rounded-md border border-input bg-card px-2 text-sm" value={form.numGuards} onChange={(e) => setForm((p) => ({ ...p, numGuards: Number(e.target.value) }))}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">N° puestos</Label>
                <select className="flex h-9 w-20 rounded-md border border-input bg-card px-2 text-sm" value={form.numPuestos} onChange={(e) => setForm((p) => ({ ...p, numPuestos: Number(e.target.value) }))}>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sueldo base</Label>
                <Input type="text" inputMode="numeric" value={formatNumber(form.baseSalary, { minDecimals: 0, maxDecimals: 0 })} onChange={(e) => setForm((p) => ({ ...p, baseSalary: parseLocalizedNumber(e.target.value) }))} className="h-9 bg-background text-sm" />
              </div>

              <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={handleCalculate}>
                <Calculator className="h-3 w-3" />
                {calculating ? "Calculando..." : "Calcular costo"}
              </Button>

              {preview && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-emerald-400">Costo empresa / guardia</span><span className="font-mono text-emerald-400">{formatCurrency(preview.monthly_employer_cost_clp)}</span></div>
                  <div className="flex justify-between"><span className="text-blue-400">Liquido / guardia</span><span className="font-mono text-blue-400">{formatCurrency(preview.worker_net_salary_estimate)}</span></div>
                  <div className="flex justify-between border-t pt-1"><span>Total puesto</span><span className="font-mono">{formatCurrency(preview.monthly_employer_cost_clp * form.numGuards * form.numPuestos)}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              AFP Modelo - Fonasa por defecto
            </Badge>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
