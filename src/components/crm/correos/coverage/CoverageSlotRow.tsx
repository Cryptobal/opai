"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Check,
  ChevronDown,
  Copy,
  Moon,
  NotebookPen,
  Sun,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CatalogPicker } from "@/components/cpq/position-matrix/CatalogPicker";
import { JornadaHoursChip } from "@/components/cpq/position-matrix/JornadaHoursChip";
import { TouchStepper } from "@/components/cpq/position-matrix/TouchStepper";
import {
  HOURS_24,
  WEEKDAY_ORDER,
  analizarTurno,
  DEFAULT_COLACION_MIN,
  defaultDiasForRol,
  diasLabel,
  isNightShift,
} from "@/components/cpq/position-matrix/shift-utils";
import { useLiquidoPreview } from "@/components/cpq/position-matrix/useLiquidoPreview";
import { HOLIDAY_DAY, normalizeWeekdays, onlyRealWeekdays } from "@/lib/cpq/weekdays";
import { useCpqCatalogs } from "@/lib/cpq/use-cpq-catalogs";
import { resolveSlotBaseSalary } from "@/lib/crm/resolve-slot-base-salary";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type {
  CrmStructureCoverageSlot,
  CrmStructureInstallation,
} from "@/modules/crm/email/email-to-crm-structure.types";
import {
  buildRegimenOptions,
  isRondinRegimen,
  type RegimenOption,
} from "./coverage-grouping";

const FESTIVO = "festivo";
const DEFAULT_REGIMEN_OPTIONS = buildRegimenOptions();
const LABEL = "text-[12px] font-medium uppercase tracking-wide text-ds-text-3";
const FIELD =
  "h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1";

/** Convierte días CPQ (Lun… + Fer) al formato del plan (lunes… + festivo). */
function toCrmDias(shortDays: string[]): string[] {
  const map: Record<string, string> = {
    Lun: "lunes",
    Mar: "martes",
    "Mié": "miercoles",
    Jue: "jueves",
    Vie: "viernes",
    "Sáb": "sabado",
    Dom: "domingo",
  };
  const out: string[] = [];
  for (const d of shortDays) {
    if (d === HOLIDAY_DAY) {
      if (!out.includes(FESTIVO)) out.push(FESTIVO);
      continue;
    }
    const long = map[d];
    if (long && !out.includes(long)) out.push(long);
  }
  return out;
}

function findCatalogId(
  list: Array<{ id: string; name: string }>,
  name: string | null | undefined,
): string {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return "";
  return list.find((x) => x.name.trim().toLowerCase() === n)?.id ?? "";
}

export type CoverageSlotRowProps = {
  slot: CrmStructureCoverageSlot;
  instIdx: number;
  slotIdx: number;
  /** @deprecated Preferí `moveTargets`. Se mantiene por compat de tests/call sites. */
  installations?: CrmStructureInstallation[];
  /** Destinos para "Mover a …" (otras instalaciones). */
  moveTargets?: Array<{ idx: number; name: string }>;
  editable: boolean;
  onUpdate: (
    field: keyof CrmStructureCoverageSlot,
    value: unknown,
    opts?: { recalc?: boolean; lockHeadcount?: boolean },
  ) => void;
  onMoveInstallation: (toInstIdx: number) => void;
  onToggleDay: (day: string) => void;
  onBumpSim: (delta: number) => void;
  onBumpHeadcount: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Fila recién agregada: foco + selección en el nombre. */
  autoFocusName?: boolean;
  onAutoFocusDone?: () => void;
  /** Roles de turno del tenant (catálogo CPQ); sin dato usa la lista estática. */
  regimenOptions?: RegimenOption[];
  /** Piso salarial del pliego (si existe) para sembrar el bruto. */
  salaryFloor?: number | null;
};

export function CoverageSlotRow({
  slot,
  instIdx,
  installations = [],
  moveTargets,
  editable,
  onUpdate,
  onMoveInstallation,
  onToggleDay: _onToggleDay,
  onBumpSim: _onBumpSim,
  onBumpHeadcount: _onBumpHeadcount,
  onDuplicate,
  onRemove,
  autoFocusName = false,
  onAutoFocusDone,
  regimenOptions = DEFAULT_REGIMEN_OPTIONS,
  salaryFloor = null,
}: CoverageSlotRowProps) {
  const catalogs = useCpqCatalogs();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [expanded, setExpanded] = useState(Boolean(autoFocusName && editable));
  const [colacionMin, setColacionMin] = useState(DEFAULT_COLACION_MIN);
  const [customName, setCustomName] = useState(slot.name ?? "");

  const bruto = resolveSlotBaseSalary(slot.baseSalary, salaryFloor);
  const liquidoPreview = useLiquidoPreview(bruto, { disabled: !editable });
  const cpqDias = normalizeWeekdays(slot.dias);
  const night = isNightShift(slot.horaInicio);
  const puestoId = findCatalogId(catalogs.puestos, slot.name);
  const cargoId = findCatalogId(catalogs.cargos, slot.role);
  const rolId = findCatalogId(catalogs.roles, slot.regimen);
  const rolName =
    catalogs.roles.find((r) => r.id === rolId)?.name ?? slot.regimen ?? undefined;
  const jornada = analizarTurno({
    inicio: slot.horaInicio,
    fin: slot.horaFin,
    dias: cpqDias,
    rolName,
    colacionMin,
  });
  const targets =
    moveTargets ??
    installations
      .map((inst, i) => ({ idx: i, name: inst.name || `Instalación ${i + 1}` }))
      .filter((t) => t.idx !== instIdx);

  useEffect(() => {
    setCustomName(slot.name ?? "");
  }, [slot.name]);

  useEffect(() => {
    if (!autoFocusName || !editable) return;
    setExpanded(true);
    nameRef.current?.focus();
    nameRef.current?.select();
    onAutoFocusDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusName, editable]);

  function setCpqDias(nextShort: string[]) {
    if (onlyRealWeekdays(nextShort).length === 0) {
      toast.error("Debe quedar al menos un día");
      return;
    }
    onUpdate("dias", toCrmDias(nextShort));
  }

  function toggleCpqDay(d: string) {
    const has = cpqDias.includes(d as (typeof cpqDias)[number]);
    const next = has ? cpqDias.filter((x) => x !== d) : [...cpqDias, d];
    setCpqDias(next);
  }

  // Compat: el padre aún pasa handlers con API legacy (días largos / steppers).
  void _onToggleDay;
  void _onBumpSim;
  void _onBumpHeadcount;

  function applyPuesto(id: string) {
    const name = catalogs.puestos.find((p) => p.id === id)?.name ?? "";
    onUpdate("name", name, { recalc: false });
  }

  function applyCargo(id: string) {
    const name = catalogs.cargos.find((c) => c.id === id)?.name ?? null;
    onUpdate("role", name, { recalc: false });
  }

  function applyRol(id: string) {
    const rol = catalogs.roles.find((r) => r.id === id);
    const name = rol?.name ?? null;
    onUpdate("regimen", name);
    if (rol?.salary != null && rol.salary > 0) {
      onUpdate("baseSalary", rol.salary, { recalc: false });
    }
    const defDias = defaultDiasForRol(name);
    if (defDias) {
      const keepF = cpqDias.includes(HOLIDAY_DAY);
      setCpqDias(keepF ? [...defDias, HOLIDAY_DAY] : defDias);
    }
  }

  const summaryTitle = customName.trim() || slot.name || "Puesto";
  const liquido = liquidoPreview?.net ?? null;
  const perGuard = liquidoPreview?.employerPerGuard ?? null;
  const totalGuards = (slot.headcount || 1) * (slot.simultaneous || 1);
  const costo = perGuard != null ? perGuard * totalGuards : null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ds-tap",
          expanded
            ? "border-primary/40 bg-primary/5"
            : "border-ds-border-default bg-ds-surface-1 hover:bg-ds-surface-2",
        )}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[12px] font-semibold",
            night
              ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
              : "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
          )}
        >
          {night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
          {night ? "Noche" : "Día"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-ds-text-1">
            {summaryTitle}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ds-text-3">
            <span className="font-mono">
              {slot.horaInicio}–{slot.horaFin}
            </span>
            <span>·</span>
            <span>{diasLabel(cpqDias)}</span>
            <span>·</span>
            <span className="font-mono">
              {slot.headcount}g × {slot.simultaneous || 1} pto
              {(slot.simultaneous || 1) !== 1 ? "s" : ""}
            </span>
            <span>·</span>
            <JornadaHoursChip analysis={jornada} variant="compact" />
          </div>
          {slot.notes?.trim() ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] italic text-ds-text-3">
              <NotebookPen className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{slot.notes}</span>
            </span>
          ) : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {slot.horarioAsumido && (
              <Tag variant="warn" size="sm">horario asumido</Tag>
            )}
            {isRondinRegimen(slot.regimen) && (
              <Tag variant="info" size="sm">rondín</Tag>
            )}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end sm:flex">
          <span className="font-mono text-[12px] font-semibold tabular-nums text-ds-text-1">
            {costo != null
              ? `$${Math.round(costo).toLocaleString("es-CL")}`
              : `${slot.weeklyHH} HH/sem`}
          </span>
          <span className="font-mono text-[12px] text-ds-text-4">
            bruto {bruto.toLocaleString("es-CL")}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ds-text-4 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-ds-surface-1 p-3">
          {!editable ? (
            <p className="text-[13px] text-ds-text-3">Solo lectura.</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label className={LABEL}>Nombre del turno (opcional)</Label>
                <Input
                  ref={nameRef}
                  value={customName}
                  placeholder={
                    catalogs.puestos.find((p) => p.id === puestoId)?.name ||
                    "Nombre del puesto"
                  }
                  aria-label="Nombre del puesto"
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    onUpdate("name", e.target.value, { recalc: false });
                  }}
                  className="h-10 sm:h-9"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className={LABEL}>Tipo de puesto</Label>
                  {catalogs.puestos.length > 0 ? (
                    <CatalogPicker
                      kind="puesto"
                      value={puestoId}
                      onChange={applyPuesto}
                      triggerClassName="h-10 sm:h-9"
                    />
                  ) : (
                    <Input
                      value={slot.name}
                      onChange={(e) =>
                        onUpdate("name", e.target.value, { recalc: false })
                      }
                      className="h-10 sm:h-9"
                      placeholder="Puesto"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className={LABEL}>Cargo</Label>
                  {catalogs.cargos.length > 0 ? (
                    <CatalogPicker
                      kind="cargo"
                      value={cargoId}
                      onChange={applyCargo}
                      triggerClassName="h-10 sm:h-9"
                    />
                  ) : (
                    <Input
                      value={slot.role ?? ""}
                      onChange={(e) =>
                        onUpdate("role", e.target.value || null, { recalc: false })
                      }
                      className="h-10 sm:h-9"
                      placeholder="Cargo"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className={LABEL}>Rol</Label>
                  {catalogs.roles.length > 0 ? (
                    <CatalogPicker
                      kind="rol"
                      value={rolId}
                      onChange={applyRol}
                      triggerClassName="h-10 sm:h-9"
                    />
                  ) : (
                    <SimpleSelect
                      className={`${FIELD} w-full`}
                      value={slot.regimen ?? ""}
                      onValueChange={(v) => onUpdate("regimen", v || null)}
                      options={regimenOptions}
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                <div>
                  <Label className={LABEL}>Horario</Label>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SimpleSelect
                      className={cn(FIELD, "w-[88px] font-mono")}
                      value={slot.horaInicio}
                      onValueChange={(v) => onUpdate("horaInicio", v || "08:00")}
                      options={HOURS_24.map((t0) => ({ value: t0, label: t0 }))}
                    />
                    <span className="text-ds-text-3">–</span>
                    <SimpleSelect
                      className={cn(FIELD, "w-[88px] font-mono")}
                      value={slot.horaFin}
                      onValueChange={(v) => onUpdate("horaFin", v || "20:00")}
                      options={HOURS_24.map((t0) => ({ value: t0, label: t0 }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 sm:h-9 sm:w-9"
                      title="Invertir horario (día ↔ noche)"
                      onClick={() => {
                        onUpdate("horaInicio", slot.horaFin);
                        onUpdate("horaFin", slot.horaInicio);
                      }}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] uppercase tracking-wide text-ds-text-3">
                        Colación
                      </span>
                      <SimpleSelect
                        className={cn(FIELD, "w-[68px]")}
                        value={String(colacionMin)}
                        onValueChange={(v) => setColacionMin(Number(v))}
                        title="Minutos de colación (no imputable a la jornada)"
                        options={[0, 30, 45, 60].map((m) => ({
                          value: String(m),
                          label: `${m}m`,
                        }))}
                      />
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <JornadaHoursChip analysis={jornada} variant="full" />
                  </div>
                </div>
                <div>
                  <Label className={LABEL}>Días</Label>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {WEEKDAY_ORDER.map((d, idx) => {
                      const on = cpqDias.includes(d);
                      const activeCls =
                        idx < 5
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg";
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleCpqDay(d)}
                          className={cn(
                            "h-10 min-w-[2.5rem] rounded-md border px-1.5 text-[12px] font-semibold transition-colors sm:h-9 sm:min-w-[2.25rem]",
                            on
                              ? activeCls
                              : "border-ds-border-default bg-ds-surface-1 text-ds-text-3 hover:bg-ds-surface-2",
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                    <span className="mx-0.5 h-4 w-px bg-ds-border-default" aria-hidden />
                    <button
                      type="button"
                      title="Cubre festivos"
                      onClick={() => toggleCpqDay(HOLIDAY_DAY)}
                      className={cn(
                        "h-10 min-w-[2.5rem] rounded-md border px-1.5 text-[12px] font-semibold transition-colors sm:h-9 sm:min-w-[2.25rem]",
                        cpqDias.includes(HOLIDAY_DAY)
                          ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                          : "border-dashed border-ds-border-default bg-ds-surface-1 text-ds-text-3 hover:bg-ds-surface-2",
                      )}
                    >
                      F
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className={LABEL}>Guardias</Label>
                  <TouchStepper
                    className="sm:hidden"
                    ariaLabel="guardias"
                    value={slot.headcount}
                    min={1}
                    max={40}
                    onChange={(n) =>
                      onUpdate("headcount", n, { recalc: true, lockHeadcount: true })
                    }
                  />
                  <SimpleSelect
                    className={cn(FIELD, "hidden w-full sm:flex")}
                    value={String(slot.headcount)}
                    onValueChange={(v) =>
                      onUpdate("headcount", Number(v) || 1, {
                        recalc: true,
                        lockHeadcount: true,
                      })
                    }
                    options={Array.from({ length: 40 }, (_, i) => i + 1).map((n) => ({
                      value: String(n),
                      label: String(n),
                    }))}
                  />
                  {slot.headcountLocked && (
                    <span className="text-[12px] text-ds-text-4">manual</span>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className={LABEL}>N° Puestos</Label>
                  <TouchStepper
                    className="sm:hidden"
                    ariaLabel="número de puestos"
                    value={slot.simultaneous || 1}
                    min={1}
                    max={20}
                    onChange={(n) => onUpdate("simultaneous", n)}
                  />
                  <SimpleSelect
                    className={cn(FIELD, "hidden w-full sm:flex")}
                    value={String(slot.simultaneous || 1)}
                    onValueChange={(v) => onUpdate("simultaneous", Number(v) || 1)}
                    options={Array.from({ length: 20 }, (_, i) => i + 1).map((n) => ({
                      value: String(n),
                      label: String(n),
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={LABEL}>Sueldo bruto</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    aria-label="Sueldo bruto"
                    value={formatNumber(bruto, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => {
                      const n = parseLocalizedNumber(e.target.value) || 0;
                      onUpdate("baseSalary", n > 0 ? n : null, { recalc: false });
                    }}
                    className="h-10 font-mono text-[13px] sm:h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={LABEL}>Sueldo líquido</Label>
                  <div
                    className={cn(
                      FIELD,
                      "flex items-center bg-ds-surface-2 text-ds-text-2",
                    )}
                  >
                    <span className="font-mono text-[13px]">
                      {liquido != null && liquido > 0
                        ? Math.round(liquido).toLocaleString("es-CL")
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/[0.04] p-2.5">
                <Label className={LABEL}>Observaciones del turno</Label>
                <textarea
                  value={slot.notes ?? ""}
                  maxLength={500}
                  rows={3}
                  placeholder="Funciones, protocolos o particularidades de este turno…"
                  onChange={(e) =>
                    onUpdate("notes", e.target.value || null, { recalc: false })
                  }
                  className="w-full resize-y rounded-md border border-ds-border-default bg-ds-surface-1 px-2.5 py-2 text-[13px] text-ds-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                <p className="text-[12px] text-ds-text-4">
                  Se lleva a la cotización CPQ al crear la estructura.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ds-border-subtle pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className={LABEL}>Costo empresa / mes</p>
                    <p className="font-mono text-[13px] font-semibold tabular-nums text-ds-text-1">
                      {costo != null
                        ? `$${Math.round(costo).toLocaleString("es-CL")}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={LABEL}>Por guardia</p>
                    <p className="font-mono text-[13px] font-semibold tabular-nums text-ds-text-1">
                      {perGuard != null
                        ? `$${Math.round(perGuard).toLocaleString("es-CL")}`
                        : "—"}
                    </p>
                  </div>
                  <span className="font-mono text-[12px] text-ds-text-4">
                    {slot.weeklyHH} HH/sem
                    {slot.pattern ? ` · ${slot.pattern}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {targets.length > 0 && (
                    <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 gap-1 sm:h-9"
                          aria-label="Mover a otra instalación"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" /> Mover
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-56 border-ds-border-default bg-ds-surface-1 p-1"
                      >
                        <p className="px-2 py-1.5 text-[12px] font-medium text-ds-text-3">
                          Mover a…
                        </p>
                        {targets.map((t) => (
                          <button
                            key={t.idx}
                            type="button"
                            onClick={() => {
                              onMoveInstallation(t.idx);
                              setMoveOpen(false);
                            }}
                            className="flex min-h-11 w-full items-center rounded-lg px-2 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
                          >
                            {t.name}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1 sm:h-9"
                    aria-label="Duplicar puesto"
                    onClick={onDuplicate}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 gap-1 text-status-danger-fg sm:h-9"
                    aria-label="Eliminar fila"
                    onClick={onRemove}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 gap-1 sm:h-9"
                    onClick={() => setExpanded(false)}
                  >
                    <Check className="h-3.5 w-3.5" /> Listo
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
