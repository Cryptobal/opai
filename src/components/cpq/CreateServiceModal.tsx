"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
  CalendarClock,
  Settings2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { COVERAGE_PATTERNS } from "@/lib/cpq/coverage-patterns";
import type {
  CpqCargo,
  CpqRol,
  CpqPuestoTrabajo,
  CpqCoveragePattern,
} from "@/types/cpq";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { toast } from "sonner";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
  CalendarClock,
  Settings2,
};

interface Props {
  quoteId: string;
  onCreated: () => void;
  disabled?: boolean;
}

export function CreateServiceModal({ quoteId, onCreated, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [pattern, setPattern] = useState<CpqCoveragePattern>("24-7");
  const [name, setName] = useState("");
  const [puestos, setPuestos] = useState<CpqPuestoTrabajo[]>([]);
  const [cargos, setCargos] = useState<CpqCargo[]>([]);
  const [roles, setRoles] = useState<CpqRol[]>([]);
  const [puestoTrabajoId, setPuestoTrabajoId] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [rolId, setRolId] = useState("");
  const [baseSalary, setBaseSalary] = useState(600000);
  const [numPuestos, setNumPuestos] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
      fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
      fetch("/api/cpq/roles?active=true").then((r) => r.json()),
    ])
      .then(([p, c, r]) => {
        const ps = p.data || [];
        const cs = c.data || [];
        const rs = r.data || [];
        setPuestos(ps);
        setCargos(cs);
        setRoles(rs);
        setPuestoTrabajoId((prev) => prev || ps[0]?.id || "");
        setCargoId((prev) => prev || cs[0]?.id || "");
        setRolId((prev) => prev || rs[0]?.id || "");
      })
      .catch(console.error);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPattern("24-7");
      setName("");
      setBaseSalary(600000);
      setNumPuestos(1);
    }
  }, [open]);

  const meta = useMemo(() => COVERAGE_PATTERNS.find((p) => p.id === pattern)!, [pattern]);
  const needsShiftConfig = meta.template !== null;

  const suggestedName = useMemo(() => {
    const puestoName = puestos.find((p) => p.id === puestoTrabajoId)?.name;
    if (!puestoName) return "";
    return `${puestoName} ${meta.shortLabel}`;
  }, [puestos, puestoTrabajoId, meta.shortLabel]);

  useEffect(() => {
    if (!name && suggestedName) setName(suggestedName);
  }, [suggestedName, name]);

  const submit = async () => {
    const trimmed = name.trim() || suggestedName;
    if (!trimmed) {
      toast.error("Nombre del servicio requerido");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/cpq/quotes/${quoteId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          coveragePattern: pattern,
          iconName: meta.icon,
          puestoTrabajoId: needsShiftConfig ? puestoTrabajoId : undefined,
          cargoId: needsShiftConfig ? cargoId : undefined,
          rolId: needsShiftConfig ? rolId : undefined,
          baseSalary: needsShiftConfig ? baseSalary : undefined,
          numPuestos,
          skipShifts: !needsShiftConfig,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Error");
      toast.success(`Servicio "${trimmed}" creado`);
      setOpen(false);
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo crear el servicio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled}>
          <Plus className="h-4 w-4" />
          <span>Agregar Servicio</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Nuevo servicio {step === 1 ? "— paso 1 de 2" : "— paso 2 de 2"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">¿Qué tipo de cobertura necesitas?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COVERAGE_PATTERNS.map((p) => {
                const Icon = ICONS[p.icon] || ShieldCheck;
                const selected = p.id === pattern;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPattern(p.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium leading-tight">{p.label}</span>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {p.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setStep(2)} className="gap-1">
                Continuar <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {meta.shortLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">{meta.description}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Nombre del servicio *
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={suggestedName || "Acceso Principal, Recepción Edificio A..."}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Este nombre identifica el servicio en cotización, propuesta y dotación.
              </p>
            </div>

            {needsShiftConfig && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Tipo de puesto *
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={puestoTrabajoId}
                      onChange={(e) => setPuestoTrabajoId(e.target.value)}
                    >
                      {puestos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Cargo *
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={cargoId}
                      onChange={(e) => setCargoId(e.target.value)}
                    >
                      {cargos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Rol *
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={rolId}
                      onChange={(e) => setRolId(e.target.value)}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Sueldo bruto base
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(baseSalary, { minDecimals: 0, maxDecimals: 0 })}
                      onChange={(e) => setBaseSalary(parseLocalizedNumber(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      N° puestos físicos
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={numPuestos}
                      onChange={(e) => setNumPuestos(Number(e.target.value))}
                    >
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Multiplica los turnos plantilla (ej: 2 puestos físicos 24/7 → 4 turnos).
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-between pt-2">
              <Button size="sm" variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Atrás
              </Button>
              <Button size="sm" onClick={submit} disabled={loading}>
                {loading ? "Creando..." : "Crear servicio"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
