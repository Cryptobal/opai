/**
 * Modal para crear puesto de trabajo CPQ
 * Rediseñado: orden intuitivo, AFP/Salud ocultos (defaults Modelo/Fonasa).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, WEEKDAY_ORDER } from "@/components/cpq/utils";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type { CpqCargo, CpqRol, CpqPuestoTrabajo } from "@/types/cpq";
import { Calculator, Plus } from "lucide-react";
import { toast } from "sonner";

interface CreatePositionModalProps {
  quoteId: string;
  onCreated?: () => void;
  disabled?: boolean;
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

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

const normalizeCatalogLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function CreatePositionModal({ quoteId, onCreated, disabled }: CreatePositionModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [cargos, setCargos] = useState<CpqCargo[]>([]);
  const [roles, setRoles] = useState<CpqRol[]>([]);
  const [puestos, setPuestos] = useState<CpqPuestoTrabajo[]>([]);

  const [form, setForm] = useState({
    puestoTrabajoId: "",
    customName: "",
    description: "",
    weekdays: [] as string[],
    startTime: "08:00",
    endTime: "20:00",
    numGuards: 1,
    numPuestos: 1,
    cargoId: "",
    rolId: "",
    baseSalary: 550000,
    afpName: "modelo",
    healthSystem: "fonasa",
    healthPlanPct: 0.07,
  });

  useEffect(() => {
    if (open) {
      Promise.all([
        fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
        fetch("/api/cpq/roles?active=true").then((r) => r.json()),
        fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
      ]).then(([c, r, p]) => {
        const nextCargos = c.data || [];
        const nextRoles = r.data || [];
        const nextPuestos = p.data || [];
        setCargos(nextCargos);
        setRoles(nextRoles);
        setPuestos(nextPuestos);

        const defaultPuesto =
          nextPuestos.find((item: CpqPuestoTrabajo) => {
            const label = normalizeCatalogLabel(item.name || "");
            return label.includes("control") && label.includes("acceso");
          }) ??
          nextPuestos.find((item: CpqPuestoTrabajo) =>
            normalizeCatalogLabel(item.name || "").includes("acceso")
          ) ??
          nextPuestos[0];

        const defaultCargo =
          nextCargos.find((item: CpqCargo) => normalizeCatalogLabel(item.name || "") === "guardia") ??
          nextCargos.find((item: CpqCargo) =>
            normalizeCatalogLabel(item.name || "").includes("guardia")
          ) ??
          nextCargos[0];

        setForm((prev) => ({
          ...prev,
          puestoTrabajoId: prev.puestoTrabajoId || defaultPuesto?.id || "",
          cargoId: prev.cargoId || defaultCargo?.id || "",
          rolId: prev.rolId || nextRoles[0]?.id || "",
        }));
      }).catch(console.error);
    }
  }, [open]);

  const toggleWeekday = (day: string) => {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day) ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day],
    }));
  };

  const applyWeekdayPreset = (preset: "weekdays" | "weekend" | "all" | "clear") => {
    const map = { clear: [], all: [...WEEKDAY_ORDER], weekdays: WEEKDAY_ORDER.slice(0, 5), weekend: WEEKDAY_ORDER.slice(5) };
    setForm((prev) => ({ ...prev, weekdays: map[preset] }));
  };

  const healthPlanPct = useMemo(() => (form.healthSystem === "fonasa" ? 0.07 : form.healthPlanPct || 0.07), [form.healthPlanPct, form.healthSystem]);
  const shiftHours = useMemo(() => getShiftHours(form.startTime, form.endTime), [form.startTime, form.endTime]);

  const handleCalculate = useCallback(async () => {
    if (!form.baseSalary || Number(form.baseSalary) <= 0) return;
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
  }, [form.baseSalary, form.afpName, form.healthSystem, healthPlanPct]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !form.baseSalary || Number(form.baseSalary) <= 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { handleCalculate(); }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [open, form.baseSalary, form.afpName, form.healthSystem, healthPlanPct, handleCalculate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.weekdays || form.weekdays.length === 0) {
      toast.error("Debes seleccionar al menos un día de la semana");
      return;
    }
    if (!form.cargoId || !form.puestoTrabajoId || !form.rolId) {
      toast.error("Debes seleccionar cargo, tipo de puesto y rol");
      return;
    }
    setLoading(true);
    try {
      const cargoName = cargos.find((c) => c.id === form.cargoId)?.name || "";
      const puestoName = puestos.find((p) => p.id === form.puestoTrabajoId)?.name || "";
      const resolvedName = [cargoName, puestoName].filter(Boolean).join(" - ");
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, customName: resolvedName || null, healthPlanPct }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error al crear puesto");
      toast.success("Puesto creado");
      setOpen(false);
      setPreview(null);
      onCreated?.();
    } catch (err: any) {
      console.error("Error creating position:", err);
      toast.error(err?.message || "Error al crear el puesto");
    } finally {
      setLoading(false);
    }
  };

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Agregar Puesto</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Puesto de Trabajo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Identificación: Cargo + Tipo + Rol ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cargo *</Label>
              <select className={selectClass} value={form.cargoId} onChange={(e) => setForm((p) => ({ ...p, cargoId: e.target.value }))}>
                <option value="">Selecciona un cargo</option>
                {cargos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo de Puesto *</Label>
              <select className={selectClass} value={form.puestoTrabajoId} onChange={(e) => setForm((p) => ({ ...p, puestoTrabajoId: e.target.value }))}>
                <option value="">Selecciona un puesto</option>
                {puestos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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

          {/* ── Operación: Horario + Días + Guardias ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horario</Label>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant={form.startTime === "08:00" && form.endTime === "20:00" ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setForm((p) => ({ ...p, startTime: "08:00", endTime: "20:00" }))}>Día</Button>
                  <Button type="button" size="sm" variant={form.startTime === "20:00" && form.endTime === "08:00" ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setForm((p) => ({ ...p, startTime: "20:00", endTime: "08:00" }))}>Noche</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <select className={selectClass} value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Término</Label>
                  <select className={selectClass} value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Jornada: <span className="font-medium text-foreground">{shiftHours === null ? "--" : `${shiftHours % 1 === 0 ? shiftHours.toFixed(0) : shiftHours.toFixed(1)} h`}</span>
              </p>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Días</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => applyWeekdayPreset("weekdays")}>Lun-Vie</Button>
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => applyWeekdayPreset("weekend")}>Sáb-Dom</Button>
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => applyWeekdayPreset("all")}>Todos</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => applyWeekdayPreset("clear")}>Limpiar</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_ORDER.map((day) => {
                    const active = form.weekdays.includes(day);
                    return (
                      <button key={day} type="button" onClick={() => toggleWeekday(day)} aria-pressed={active} className={`rounded-full border px-2.5 py-0.5 text-sm transition-colors ${active ? "border-primary/50 bg-primary/15 text-primary" : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}>{day}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guardias</Label>
                <input
                  type="number"
                  min={1}
                  className="flex h-9 w-20 rounded-md border border-input bg-card px-2 text-sm"
                  value={form.numGuards}
                  onChange={(e) => setForm((p) => ({ ...p, numGuards: Math.max(1, Number(e.target.value) || 1) }))}
                />
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
                <div className="rounded-md border border-status-ok-border bg-status-ok-soft p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-status-ok-fg">Costo empresa / guardia</span><span className="font-mono text-status-ok-fg">{formatCurrency(preview.monthly_employer_cost_clp)}</span></div>
                  <div className="flex justify-between"><span className="text-status-info-fg">Líquido / guardia</span><span className="font-mono text-status-info-fg">{formatCurrency(preview.worker_net_salary_estimate)}</span></div>
                  <div className="flex justify-between border-t pt-1"><span>Total puesto</span><span className="font-mono">{formatCurrency(preview.monthly_employer_cost_clp * form.numGuards * form.numPuestos)}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <Badge variant="outline" className="text-xs text-muted-foreground">
              AFP Modelo · Fonasa por defecto
            </Badge>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Guardando..." : "Crear Puesto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
