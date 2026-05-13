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
import { makeServiceGroupKey } from "@/lib/crm/lead-service-group";
import type {
  LeadPositionItem,
  CpqCatalogOption,
} from "@/components/crm/LeadInstallationCpq";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
  CalendarClock,
  Settings2,
};

const SHORT_TO_LONG: Record<string, string> = {
  Lun: "lunes",
  Mar: "martes",
  "Mié": "miercoles",
  Jue: "jueves",
  Vie: "viernes",
  "Sáb": "sabado",
  Dom: "domingo",
};

interface Props {
  cpqPuestos: CpqCatalogOption[];
  cpqCargos: CpqCatalogOption[];
  cpqRoles: CpqCatalogOption[];
  /** Callback que recibe los nuevos LeadPositionItem listos para concatenar al array. */
  onCreate: (positions: LeadPositionItem[], groupName: string) => void;
  triggerSize?: "default" | "sm";
}

export function LeadCreateServiceWizard({
  cpqPuestos,
  cpqCargos,
  cpqRoles,
  onCreate,
  triggerSize = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [pattern, setPattern] = useState("24-7");
  const [name, setName] = useState("");
  const [puestoTrabajoId, setPuestoTrabajoId] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [rolId, setRolId] = useState("");
  const [baseSalary, setBaseSalary] = useState(600000);
  const [numPuestos, setNumPuestos] = useState(1);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPattern("24-7");
      setName("");
      setBaseSalary(600000);
      setNumPuestos(1);
      return;
    }
    setPuestoTrabajoId((prev) => prev || cpqPuestos[0]?.id || "");
    setCargoId((prev) => prev || cpqCargos[0]?.id || "");
    setRolId((prev) => prev || cpqRoles[0]?.id || "");
  }, [open, cpqPuestos, cpqCargos, cpqRoles]);

  const meta = useMemo(() => COVERAGE_PATTERNS.find((p) => p.id === pattern)!, [pattern]);
  const needsShifts = meta.template !== null;
  const suggestedName = useMemo(() => {
    const pn = cpqPuestos.find((p) => p.id === puestoTrabajoId)?.name;
    return pn ? `${pn} ${meta.shortLabel}` : "";
  }, [cpqPuestos, puestoTrabajoId, meta.shortLabel]);

  useEffect(() => {
    if (!name && suggestedName) setName(suggestedName);
  }, [suggestedName, name]);

  const submit = () => {
    const trimmed = name.trim() || suggestedName || "Servicio";
    const key = makeServiceGroupKey();
    const puestoName = cpqPuestos.find((p) => p.id === puestoTrabajoId)?.name || "Puesto";

    if (!meta.template) {
      onCreate(
        [
          {
            puestoTrabajoId,
            puesto: puestoName,
            cargoId,
            rolId,
            baseSalary: 550000,
            shiftType: "day",
            cantidad: 1,
            numPuestos: 1,
            horaInicio: "08:00",
            horaFin: "20:00",
            dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
            serviceGroupKey: key,
            serviceGroupName: trimmed,
            serviceGroupPattern: "custom",
            serviceGroupIcon: meta.icon,
          },
        ],
        trimmed
      );
      setOpen(false);
      return;
    }
    const items: LeadPositionItem[] = meta.template.positions.map((pos) => ({
      puestoTrabajoId,
      puesto: puestoName,
      cargoId,
      rolId,
      baseSalary: baseSalary || pos.baseSalary,
      shiftType: pos.shiftStart === "20:00" ? "night" : "day",
      cantidad: pos.guardsCount,
      numPuestos,
      horaInicio: pos.shiftStart,
      horaFin: pos.shiftEnd,
      dias: pos.daysOfWeek.map((d) => SHORT_TO_LONG[d] ?? d.toLowerCase()),
      serviceGroupKey: key,
      serviceGroupName: trimmed,
      serviceGroupPattern: pattern as any,
      serviceGroupIcon: meta.icon,
    }));
    onCreate(items, trimmed);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={triggerSize} className="gap-1 h-7 text-xs">
          <Plus className="h-3 w-3" /> Agregar Servicio
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Nuevo servicio {step === 1 ? "— paso 1 de 2" : "— paso 2 de 2"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              ¿Qué tipo de cobertura necesita el cliente?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COVERAGE_PATTERNS.map((p) => {
                const Icon = ICONS[p.icon] || ShieldCheck;
                const sel = p.id === pattern;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPattern(p.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
                      sel
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
        ) : (
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
                placeholder={suggestedName || "Acceso Principal, Recepción..."}
                className="h-9 text-sm"
              />
            </div>
            {needsShifts && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Tipo de puesto *
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border bg-card px-3 text-sm"
                      value={puestoTrabajoId}
                      onChange={(e) => setPuestoTrabajoId(e.target.value)}
                    >
                      {cpqPuestos.map((p) => (
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
                      className="flex h-9 w-full rounded-md border bg-card px-3 text-sm"
                      value={cargoId}
                      onChange={(e) => setCargoId(e.target.value)}
                    >
                      {cpqCargos.map((c) => (
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
                      className="flex h-9 w-full rounded-md border bg-card px-3 text-sm"
                      value={rolId}
                      onChange={(e) => setRolId(e.target.value)}
                    >
                      {cpqRoles.map((r) => (
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
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    N° puestos físicos
                  </Label>
                  <select
                    className="flex h-9 w-32 rounded-md border bg-card px-3 text-sm"
                    value={numPuestos}
                    onChange={(e) => setNumPuestos(Number(e.target.value))}
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="flex justify-between pt-2">
              <Button size="sm" variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Atrás
              </Button>
              <Button size="sm" onClick={submit}>
                Crear servicio
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
