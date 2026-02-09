/**
 * Modal para editar puesto de trabajo CPQ
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, WEEKDAY_ORDER } from "@/components/cpq/utils";
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
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
];

const getShiftHours = (startTime: string, endTime: string) => {
  if (!startTime || !endTime) return null;
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  if (Number.isNaN(startH) || Number.isNaN(startM) || Number.isNaN(endH) || Number.isNaN(endM)) {
    return null;
  }
  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const diffMinutes = endMinutes - startMinutes;
  return diffMinutes / 60;
};

export function EditPositionModal({
  quoteId,
  position,
  open,
  onOpenChange,
  onUpdated,
}: EditPositionModalProps) {
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
      cargoId: position.cargoId,
      rolId: position.rolId,
      baseSalary: Number(position.baseSalary),
      afpName: position.afpName || "modelo",
      healthSystem: position.healthSystem || "fonasa",
      healthPlanPct: position.healthPlanPct || 0.07,
    });
    setPreview(null);
  }, [open, position]);

  const fetchCatalogs = async () => {
    try {
      const [cargosRes, rolesRes, puestosRes] = await Promise.all([
        fetch("/api/cpq/cargos?active=true"),
        fetch("/api/cpq/roles?active=true"),
        fetch("/api/cpq/puestos?active=true"),
      ]);
      const cargosData = await cargosRes.json();
      const rolesData = await rolesRes.json();
      const puestosData = await puestosRes.json();
      setCargos(cargosData.data || []);
      setRoles(rolesData.data || []);
      setPuestos(puestosData.data || []);
    } catch (err) {
      console.error("Error loading CPQ catalogs:", err);
    }
  };

  useEffect(() => {
    if (open) fetchCatalogs();
  }, [open]);

  const toggleWeekday = (day: string) => {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day],
    }));
  };

  const applyWeekdayPreset = (preset: "weekdays" | "weekend" | "all" | "clear") => {
    if (preset === "clear") {
      setForm((prev) => ({ ...prev, weekdays: [] }));
      return;
    }
    if (preset === "all") {
      setForm((prev) => ({ ...prev, weekdays: [...WEEKDAY_ORDER] }));
      return;
    }
    if (preset === "weekdays") {
      setForm((prev) => ({ ...prev, weekdays: WEEKDAY_ORDER.slice(0, 5) }));
      return;
    }
    setForm((prev) => ({ ...prev, weekdays: WEEKDAY_ORDER.slice(5) }));
  };

  const healthPlanPct = useMemo(() => {
    if (form.healthSystem === "fonasa") return 0.07;
    return form.healthPlanPct || 0.07;
  }, [form.healthPlanPct, form.healthSystem]);

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
          assumptions: {
            include_vacation_provision: true,
            include_severance_provision: true,
            vacation_provision_pct: 0.0833,
            severance_provision_pct: 0.04166,
          },
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
    setLoading(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          healthPlanPct,
        }),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Editar Puesto de Trabajo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold uppercase text-blue-400">Puesto</h3>

              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Tipo de Puesto *</Label>
                <select
                  className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={form.puestoTrabajoId}
                  onChange={(e) => setForm((p) => ({ ...p, puestoTrabajoId: e.target.value }))}
                >
                  <option value="">Selecciona un puesto</option>
                  {puestos.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Nombre personalizado</Label>
                <Input
                  value={form.customName}
                  onChange={(e) => setForm((p) => ({ ...p, customName: e.target.value }))}
                  className="h-11 sm:h-9 bg-background text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">Hora inicio</Label>
                  <select
                    className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                    value={form.startTime}
                    onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">Hora término</Label>
                  <select
                    className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                    value={form.endTime}
                    onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-xs sm:text-sm text-slate-400">
                Jornada:{" "}
                <span className="font-medium text-slate-200">
                  {shiftHours === null
                    ? "--"
                    : `${shiftHours % 1 === 0 ? shiftHours.toFixed(0) : shiftHours.toFixed(1)} h`}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs sm:text-sm">Días de servicio</Label>
                  <span className="text-[10px] text-muted-foreground">Toca para activar</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => applyWeekdayPreset("weekdays")}
                  >
                    Lun–Vie
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => applyWeekdayPreset("weekend")}
                  >
                    Sáb–Dom
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => applyWeekdayPreset("all")}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px] text-muted-foreground"
                    onClick={() => applyWeekdayPreset("clear")}
                  >
                    Limpiar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_ORDER.map((day) => {
                    const active = form.weekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(day)}
                        aria-pressed={active}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "border-blue-400/70 bg-blue-600/20 text-blue-100"
                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Cantidad de guardias</Label>
                <select
                  className="flex h-11 sm:h-9 w-24 rounded-md border border-input bg-card px-2 text-sm"
                  value={form.numGuards}
                  onChange={(e) => setForm((p) => ({ ...p, numGuards: Number(e.target.value) }))}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold uppercase text-purple-400">Estructura</h3>

              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Cargo *</Label>
                <select
                  className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={form.cargoId}
                  onChange={(e) => setForm((p) => ({ ...p, cargoId: e.target.value }))}
                >
                  <option value="">Selecciona un cargo</option>
                  {cargos.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Rol *</Label>
                <select
                  className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={form.rolId}
                  onChange={(e) => setForm((p) => ({ ...p, rolId: e.target.value }))}
                >
                  <option value="">Selecciona un rol</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Sueldo base</Label>
                <Input
                  type="number"
                  value={form.baseSalary}
                  onChange={(e) => setForm((p) => ({ ...p, baseSalary: Number(e.target.value) }))}
                  className="h-11 sm:h-9 bg-background text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">AFP</Label>
                  <select
                    className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                    value={form.afpName}
                    onChange={(e) => setForm((p) => ({ ...p, afpName: e.target.value }))}
                  >
                    <option value="modelo">Modelo</option>
                    <option value="habitat">Habitat</option>
                    <option value="capital">Capital</option>
                    <option value="cuprum">Cuprum</option>
                    <option value="planvital">PlanVital</option>
                    <option value="provida">Provida</option>
                    <option value="uno">Uno</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">Salud</Label>
                  <select
                    className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                    value={form.healthSystem}
                    onChange={(e) => setForm((p) => ({ ...p, healthSystem: e.target.value }))}
                  >
                    <option value="fonasa">Fonasa</option>
                    <option value="isapre">Isapre</option>
                  </select>
                </div>
              </div>

              {form.healthSystem === "isapre" && (
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">Plan Isapre (%)</Label>
                  <Input
                    type="number"
                    value={form.healthPlanPct}
                    onChange={(e) => setForm((p) => ({ ...p, healthPlanPct: Number(e.target.value) }))}
                    step="0.01"
                    className="h-11 sm:h-9 bg-background text-sm"
                  />
                </div>
              )}

              <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={handleCalculate}>
                <Calculator className="h-3 w-3" />
                {calculating ? "Calculando..." : "Calcular costo"}
              </Button>

              {preview && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400">Costo empresa por guardia</span>
                    <span className="font-mono text-emerald-400">
                      {formatCurrency(preview.monthly_employer_cost_clp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-400">Líquido por guardia</span>
                    <span className="font-mono text-blue-400">
                      {formatCurrency(preview.worker_net_salary_estimate)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t pt-1">
                    <span>Total puesto</span>
                    <span className="font-mono">
                      {formatCurrency(preview.monthly_employer_cost_clp * form.numGuards)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              AFP Modelo + Fonasa por defecto
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
