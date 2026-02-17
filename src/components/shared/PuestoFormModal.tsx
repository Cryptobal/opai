"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calculator, Plus, X } from "lucide-react";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

/* ── Constants ─────────────────────────────────── */

const TIME_OPTIONS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00",
];

const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/* ── Types ─────────────────────────────────────── */

type CatalogItem = { id: string; name: string; description?: string | null };
type BonoCatalogItem = {
  id: string;
  code: string;
  name: string;
  bonoType: string;
  isTaxable: boolean;
  isTributable: boolean;
  defaultAmount: number | null;
  defaultPercentage: number | null;
};

export type PuestoBonoEntry = {
  bonoCatalogId: string;
  overrideAmount?: number;
  overridePercentage?: number;
};

export type PuestoFormData = {
  puestoTrabajoId: string;
  cargoId: string;
  rolId: string;
  customName: string;
  startTime: string;
  endTime: string;
  weekdays: string[];
  numGuards: number;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: "AUTO_25" | "CUSTOM";
  gratificationCustomAmount: number;
  bonos: PuestoBonoEntry[];
  activeFrom: string;
};

export interface PuestoFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  initialData?: Partial<PuestoFormData>;
  onSave: (data: PuestoFormData) => Promise<void>;
  saving?: boolean;
}

const DEFAULT_FORM: PuestoFormData = {
  puestoTrabajoId: "",
  cargoId: "",
  rolId: "",
  customName: "",
  startTime: "08:00",
  endTime: "20:00",
  weekdays: [...WEEKDAY_ORDER],
  numGuards: 1,
  baseSalary: 550000,
  colacion: 0,
  movilizacion: 0,
  gratificationType: "AUTO_25",
  gratificationCustomAmount: 0,
  bonos: [],
  activeFrom: new Date().toISOString().slice(0, 10),
};

function getShiftHours(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const [sH, sM] = startTime.split(":").map(Number);
  const [eH, eM] = endTime.split(":").map(Number);
  if ([sH, sM, eH, eM].some((v) => Number.isNaN(v))) return null;
  const startMin = sH * 60 + sM;
  let endMin = eH * 60 + eM;
  if (endMin <= startMin) endMin += 24 * 60;
  return (endMin - startMin) / 60;
}

/* ── Component ─────────────────────────────────── */

export function PuestoFormModal({
  open,
  onOpenChange,
  title = "Puesto operativo",
  initialData,
  onSave,
  saving: externalSaving,
}: PuestoFormModalProps) {
  const [form, setForm] = useState<PuestoFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const isSaving = externalSaving ?? saving;

  // Catalogs
  const [cargos, setCargos] = useState<CatalogItem[]>([]);
  const [roles, setRoles] = useState<CatalogItem[]>([]);
  const [puestos, setPuestos] = useState<CatalogItem[]>([]);
  const [bonosCatalog, setBonosCatalog] = useState<BonoCatalogItem[]>([]);

  // Net salary estimation
  const [netEstimate, setNetEstimate] = useState<{
    netSalary: number;
    grossSalary: number;
    totalDeductions: number;
    deductions: { afp: number; health: number; afc: number; tax: number };
  } | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Load catalogs when modal opens
  useEffect(() => {
    if (open) {
      Promise.all([
        fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
        fetch("/api/cpq/roles?active=true").then((r) => r.json()),
        fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
        fetch("/api/payroll/bonos?active=true").then((r) => r.json()).catch(() => ({ data: [] })),
      ])
        .then(([c, r, p, b]) => {
          setCargos(c.data || []);
          setRoles(r.data || []);
          setPuestos(p.data || []);
          setBonosCatalog(b.data || []);
        })
        .catch(console.error);
    }
  }, [open]);

  // Reset form when modal opens with initial data
  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, ...initialData });
      setNetEstimate(null);
    }
  }, [open, initialData]);

  const calculateNetEstimate = useCallback(async () => {
    if (form.baseSalary <= 0) return;
    setEstimating(true);
    try {
      let bonosImponibles = 0;
      let bonosNoImponibles = 0;
      for (const b of form.bonos) {
        const cat = bonosCatalog.find((c) => c.id === b.bonoCatalogId);
        if (!cat) continue;
        let amt = 0;
        if (cat.bonoType === "FIJO") amt = b.overrideAmount ?? Number(cat.defaultAmount) ?? 0;
        else if (cat.bonoType === "PORCENTUAL") {
          const pct = b.overridePercentage ?? Number(cat.defaultPercentage) ?? 0;
          amt = Math.round(form.baseSalary * pct / 100);
        } else if (cat.bonoType === "CONDICIONAL") {
          amt = b.overrideAmount ?? Number(cat.defaultAmount) ?? 0;
        }
        if (cat.isTaxable) bonosImponibles += amt;
        else bonosNoImponibles += amt;
      }

      const res = await fetch("/api/payroll/estimate-net", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: form.baseSalary,
          colacion: form.colacion,
          movilizacion: form.movilizacion,
          gratificationType: form.gratificationType,
          gratificationCustomAmount: form.gratificationCustomAmount,
          bonosImponibles,
          bonosNoImponibles,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setNetEstimate(json.data);
      }
    } catch (err) {
      console.error("Error estimating net:", err);
    } finally {
      setEstimating(false);
    }
  }, [form, bonosCatalog]);

  const shiftHours = useMemo(
    () => getShiftHours(form.startTime, form.endTime),
    [form.startTime, form.endTime]
  );

  const toggleWeekday = (day: string) => {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day],
    }));
  };

  const applyWeekdayPreset = (preset: "weekdays" | "weekend" | "all" | "clear") => {
    const map = {
      clear: [] as string[],
      all: [...WEEKDAY_ORDER],
      weekdays: WEEKDAY_ORDER.slice(0, 5),
      weekend: WEEKDAY_ORDER.slice(5),
    };
    setForm((prev) => ({ ...prev, weekdays: map[preset] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.weekdays.length === 0) {
      alert("Debes seleccionar al menos un día de la semana");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Row 1: Tipo de puesto + Cargo ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tipo de Puesto *
              </Label>
              <select
                className={selectClass}
                value={form.puestoTrabajoId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, puestoTrabajoId: e.target.value }))
                }
              >
                <option value="">Selecciona un puesto</option>
                {puestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cargo *
              </Label>
              <select
                className={selectClass}
                value={form.cargoId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, cargoId: e.target.value }))
                }
              >
                <option value="">Selecciona un cargo</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Row 2: Nombre personalizado + Rol ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nombre personalizado
              </Label>
              <Input
                value={form.customName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, customName: e.target.value }))
                }
                placeholder="Ej: Control Acceso Nocturno"
                className="h-10 bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rol *
              </Label>
              <select
                className={selectClass}
                value={form.rolId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, rolId: e.target.value }))
                }
              >
                <option value="">Selecciona un rol</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.description ? ` (${r.description})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active from date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fecha de inicio
            </Label>
            <input
              type="date"
              value={form.activeFrom}
              onChange={(e) =>
                setForm((p) => ({ ...p, activeFrom: e.target.value }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Desde cuándo está activo este puesto. La pauta solo se genera desde esta fecha.
            </p>
          </div>

          <div className="border-t border-border" />

          {/* ── Row 3: Horario + Guardias + Sueldo ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Horario
                </Label>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      form.startTime === "08:00" && form.endTime === "20:00"
                        ? "default"
                        : "outline"
                    }
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        startTime: "08:00",
                        endTime: "20:00",
                      }))
                    }
                  >
                    Día
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      form.startTime === "20:00" && form.endTime === "08:00"
                        ? "default"
                        : "outline"
                    }
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        startTime: "20:00",
                        endTime: "08:00",
                      }))
                    }
                  >
                    Noche
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Inicio</Label>
                  <select
                    className={selectClass}
                    value={form.startTime}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startTime: e.target.value }))
                    }
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Término</Label>
                  <select
                    className={selectClass}
                    value={form.endTime}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, endTime: e.target.value }))
                    }
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Jornada:{" "}
                <span className="font-medium text-foreground">
                  {shiftHours === null
                    ? "--"
                    : `${shiftHours % 1 === 0 ? shiftHours.toFixed(0) : shiftHours.toFixed(1)} h`}
                </span>
              </p>

              {/* Días */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Días
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => applyWeekdayPreset("weekdays")}
                  >
                    Lun-Vie
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => applyWeekdayPreset("weekend")}
                  >
                    Sáb-Dom
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => applyWeekdayPreset("all")}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-muted-foreground"
                    onClick={() => applyWeekdayPreset("clear")}
                  >
                    Limpiar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_ORDER.map((day) => {
                    const active = form.weekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(day)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                          active
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right column: Guardias */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Guardias
                </Label>
                <select
                  className="flex h-10 w-20 rounded-md border border-input bg-card px-2 text-sm"
                  value={form.numGuards}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      numGuards: Number(e.target.value),
                    }))
                  }
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* ── Estructura de Sueldo ── */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estructura de sueldo
            </Label>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Sueldo base</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.baseSalary, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => setForm((p) => ({ ...p, baseSalary: parseLocalizedNumber(e.target.value) }))}
                  className="h-9 bg-background text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Colación</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.colacion, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => setForm((p) => ({ ...p, colacion: parseLocalizedNumber(e.target.value) }))}
                  className="h-9 bg-background text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Movilización</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.movilizacion, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => setForm((p) => ({ ...p, movilizacion: parseLocalizedNumber(e.target.value) }))}
                  className="h-9 bg-background text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Gratificación</Label>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={form.gratificationType === "AUTO_25" ? "default" : "outline"}
                    className="h-7 px-2.5 text-[10px]"
                    onClick={() => setForm((p) => ({ ...p, gratificationType: "AUTO_25" }))}
                  >
                    Auto 25%
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={form.gratificationType === "CUSTOM" ? "default" : "outline"}
                    className="h-7 px-2.5 text-[10px]"
                    onClick={() => setForm((p) => ({ ...p, gratificationType: "CUSTOM" }))}
                  >
                    Monto fijo
                  </Button>
                </div>
              </div>
              {form.gratificationType === "CUSTOM" && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Monto gratificación</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatNumber(form.gratificationCustomAmount, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setForm((p) => ({ ...p, gratificationCustomAmount: parseLocalizedNumber(e.target.value) }))}
                    className="h-9 bg-background text-sm"
                  />
                </div>
              )}
            </div>

            {/* Bonos */}
            {bonosCatalog.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">Bonos</Label>
                {form.bonos.map((bono, idx) => {
                  const cat = bonosCatalog.find((c) => c.id === bono.bonoCatalogId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        className="flex h-8 flex-1 rounded-md border border-input bg-card px-2 text-xs"
                        value={bono.bonoCatalogId}
                        onChange={(e) => {
                          const newBonos = [...form.bonos];
                          const newCat = bonosCatalog.find((c) => c.id === e.target.value);
                          newBonos[idx] = {
                            bonoCatalogId: e.target.value,
                            overrideAmount: newCat?.defaultAmount != null ? Number(newCat.defaultAmount) : undefined,
                            overridePercentage: newCat?.defaultPercentage != null ? Number(newCat.defaultPercentage) : undefined,
                          };
                          setForm((p) => ({ ...p, bonos: newBonos }));
                        }}
                      >
                        <option value="">Selecciona bono...</option>
                        {bonosCatalog.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {cat && (cat.bonoType === "FIJO" || cat.bonoType === "CONDICIONAL") && (
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Monto"
                          value={bono.overrideAmount != null ? formatNumber(bono.overrideAmount, { minDecimals: 0, maxDecimals: 0 }) : ""}
                          onChange={(e) => {
                            const newBonos = [...form.bonos];
                            newBonos[idx] = { ...newBonos[idx], overrideAmount: parseLocalizedNumber(e.target.value) };
                            setForm((p) => ({ ...p, bonos: newBonos }));
                          }}
                          className="h-8 w-28 bg-background text-xs"
                        />
                      )}
                      {cat && cat.bonoType === "PORCENTUAL" && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="%"
                            value={bono.overridePercentage ?? ""}
                            onChange={(e) => {
                              const newBonos = [...form.bonos];
                              newBonos[idx] = { ...newBonos[idx], overridePercentage: Number(e.target.value) };
                              setForm((p) => ({ ...p, bonos: newBonos }));
                            }}
                            className="h-8 w-20 bg-background text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      )}
                      {cat && (
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {cat.isTaxable ? "Imp" : "No imp"}
                        </Badge>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-destructive"
                        onClick={() => {
                          const newBonos = form.bonos.filter((_, i) => i !== idx);
                          setForm((p) => ({ ...p, bonos: newBonos }));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px]"
                  onClick={() => setForm((p) => ({ ...p, bonos: [...p.bonos, { bonoCatalogId: "" }] }))}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar bono
                </Button>
              </div>
            )}

            {/* Calcular sueldo líquido */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={calculateNetEstimate}
                disabled={estimating || form.baseSalary <= 0}
              >
                {estimating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Calculator className="mr-1.5 h-3.5 w-3.5" />
                )}
                Calcular sueldo líquido
              </Button>
              {netEstimate && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    Bruto: <strong className="text-foreground">${netEstimate.grossSalary.toLocaleString("es-CL")}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Desc: <strong className="text-destructive">-${netEstimate.totalDeductions.toLocaleString("es-CL")}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Líquido: <strong className="text-emerald-400">${netEstimate.netSalary.toLocaleString("es-CL")}</strong>
                  </span>
                </div>
              )}
            </div>

            {netEstimate && (
              <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 text-[10px] text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                <span>AFP: -${netEstimate.deductions.afp.toLocaleString("es-CL")}</span>
                <span>Salud: -${netEstimate.deductions.health.toLocaleString("es-CL")}</span>
                <span>AFC: -${netEstimate.deductions.afc.toLocaleString("es-CL")}</span>
                <span>Imp. Único: -${netEstimate.deductions.tax.toLocaleString("es-CL")}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
