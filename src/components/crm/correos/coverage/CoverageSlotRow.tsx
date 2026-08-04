"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Copy, Minus, Plus, Trash2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HOURS_24 } from "@/components/cpq/position-matrix/shift-utils";
import { useLiquidoPreview } from "@/components/cpq/position-matrix/useLiquidoPreview";
import { resolveSlotBaseSalary } from "@/lib/crm/resolve-slot-base-salary";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { WEEKDAYS_FULL } from "@/modules/crm/email/email-to-lead.types";
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
const DAY_SHORT: Record<string, string> = {
  lunes: "L", martes: "M", miercoles: "M", jueves: "J",
  viernes: "V", sabado: "S", domingo: "D",
};
const DEFAULT_REGIMEN_OPTIONS = buildRegimenOptions();
const FIELD =
  "h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[12px]";

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
  slot, instIdx, installations = [], moveTargets, editable,
  onUpdate, onMoveInstallation, onToggleDay,
  onBumpSim, onBumpHeadcount, onDuplicate, onRemove,
  autoFocusName = false, onAutoFocusDone,
  regimenOptions = DEFAULT_REGIMEN_OPTIONS,
  salaryFloor = null,
}: CoverageSlotRowProps) {
  const regimenValue = slot.regimen ?? "";
  const regimenInList = regimenOptions.some((o) => o.value === regimenValue);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const bruto = resolveSlotBaseSalary(slot.baseSalary, salaryFloor);
  const liquidoPreview = useLiquidoPreview(bruto, { disabled: !editable });
  const targets =
    moveTargets ??
    installations
      .map((inst, i) => ({ idx: i, name: inst.name || `Instalación ${i + 1}` }))
      .filter((t) => t.idx !== instIdx);

  useEffect(() => {
    if (!autoFocusName || !editable) return;
    nameRef.current?.focus();
    nameRef.current?.select();
    onAutoFocusDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusName, editable]);

  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          {editable ? (
            <input
              ref={nameRef}
              value={slot.name}
              onChange={(e) => onUpdate("name", e.target.value, { recalc: false })}
              placeholder="Nombre del puesto"
              aria-label="Nombre del puesto"
              className={`${FIELD} w-full font-medium text-ds-text-1`}
            />
          ) : (
            <p className="font-medium text-[13px] text-ds-text-1">{slot.name || "—"}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {slot.horarioAsumido && (
              <Tag variant="warn" size="sm">horario asumido</Tag>
            )}
            {isRondinRegimen(slot.regimen) && (
              <Tag variant="info" size="sm">rondín</Tag>
            )}
          </div>
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-0.5">
            {targets.length > 0 && (
              <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mover a otra instalación"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ds-text-4 ds-tap hover:text-primary sm:h-9 sm:w-9"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </button>
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
            <button type="button" aria-label="Duplicar puesto" onClick={onDuplicate}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ds-text-4 ds-tap hover:text-primary sm:h-9 sm:w-9">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Eliminar fila" onClick={onRemove}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ds-text-4 ds-tap hover:text-status-danger-fg sm:h-9 sm:w-9">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ds-text-3">Régimen</span>
          {editable ? (
            <SimpleSelect
              className={`${FIELD} w-full`}
              value={regimenValue}
              onValueChange={(v) => onUpdate("regimen", v || null)}
              options={[
                ...(regimenValue && !regimenInList
                  ? [{ value: regimenValue, label: regimenValue }]
                  : []),
                ...regimenOptions,
              ]}
            />
          ) : (
            <p className="text-[13px] text-ds-text-2">{slot.regimen ?? "—"}</p>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ds-text-3" title="Cobertura simultánea">Sim.</span>
          {editable ? (
            <Stepper value={slot.simultaneous} onBump={onBumpSim} label="simultáneos" />
          ) : (
            <p className="text-[13px] tabular-nums text-ds-text-2">{slot.simultaneous}</p>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ds-text-3">Inicio</span>
          {editable ? (
            <SimpleSelect className={`${FIELD} w-full font-mono`} value={slot.horaInicio}
              onValueChange={(v) => onUpdate("horaInicio", v || "08:00")}
              options={HOURS_24.map((t0) => ({ value: t0, label: t0 }))} />
          ) : (
            <p className="font-mono text-[13px] text-ds-text-2">{slot.horaInicio}</p>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ds-text-3">Fin</span>
          {editable ? (
            <SimpleSelect className={`${FIELD} w-full font-mono`} value={slot.horaFin}
              onValueChange={(v) => onUpdate("horaFin", v || "20:00")}
              options={HOURS_24.map((t0) => ({ value: t0, label: t0 }))} />
          ) : (
            <p className="font-mono text-[13px] text-ds-text-2">{slot.horaFin}</p>
          )}
        </label>
      </div>

      <div>
        <span className="mb-1 block text-[12px] font-medium text-ds-text-3">Días</span>
        <div className="flex flex-wrap items-center gap-1">
          {WEEKDAYS_FULL.map((day, idx) => {
            const on = slot.dias.includes(day);
            const weekend = idx >= 5;
            return (
              <button key={day} type="button" disabled={!editable}
                onClick={() => onToggleDay(day)}
                className={`h-8 min-w-[32px] rounded-md border px-1.5 text-[12px] font-medium ds-tap ${
                  on
                    ? weekend
                      ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
                      : "border-primary/40 bg-primary/15 text-primary"
                    : "border-transparent bg-ds-surface-3 text-ds-text-3"
                } disabled:opacity-80`}>
                {DAY_SHORT[day]}
              </button>
            );
          })}
          <span className="mx-0.5 h-4 w-px bg-ds-border-default" aria-hidden />
          <button type="button" disabled={!editable} title="Cubre festivos"
            onClick={() => onToggleDay(FESTIVO)}
            className={`h-8 min-w-[32px] rounded-md px-1.5 text-[12px] font-semibold ds-tap ${
              slot.dias.includes(FESTIVO)
                ? "border border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                : "border border-dashed border-ds-border-default bg-ds-surface-3 text-ds-text-3"
            } disabled:opacity-80`}>
            F
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-ds-border-subtle pt-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ds-text-3">Dotación</span>
            {editable ? (
              <div className="flex items-center gap-1">
                <Stepper value={slot.headcount} onBump={onBumpHeadcount} label="dotación" />
                {slot.headcountLocked && (
                  <span className="text-[12px] text-ds-text-4">manual</span>
                )}
              </div>
            ) : (
              <span className="text-[14px] tabular-nums font-semibold text-ds-text-1">
                {slot.headcount}
              </span>
            )}
          </div>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-ds-text-3">Bruto · Líquido</span>
            {editable ? (
              <div className="space-y-0.5">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Sueldo bruto"
                  value={formatNumber(bruto, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => {
                    const n = parseLocalizedNumber(e.target.value) || 0;
                    onUpdate("baseSalary", n > 0 ? n : null, { recalc: false });
                  }}
                  className={`${FIELD} w-[7.5rem] font-mono tabular-nums text-ds-text-1`}
                />
                <p className="font-mono text-[12px] text-ds-text-4">
                  {liquidoPreview?.net
                    ? `líq ${Math.round(liquidoPreview.net).toLocaleString("es-CL")}`
                    : "líq —"}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="font-mono text-[13px] tabular-nums text-ds-text-2">
                  {formatNumber(bruto, { minDecimals: 0, maxDecimals: 0 })}
                </p>
                <p className="font-mono text-[12px] text-ds-text-4">
                  {liquidoPreview?.net
                    ? `líq ${Math.round(liquidoPreview.net).toLocaleString("es-CL")}`
                    : "líq —"}
                </p>
              </div>
            )}
          </label>
        </div>
        <span className="font-mono text-[12px] text-ds-text-4">
          {slot.weeklyHH} HH/sem{slot.pattern ? ` · ${slot.pattern}` : ""}
        </span>
      </div>
    </div>
  );
}

function Stepper({
  value, onBump, label,
}: { value: number; onBump: (d: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Menos ${label}`} onClick={() => onBump(-1)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ds-border-default ds-tap sm:h-9 sm:w-9">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[1.75rem] text-center text-[14px] tabular-nums font-semibold text-ds-text-1">
        {value}
      </span>
      <button type="button" aria-label={`Más ${label}`} onClick={() => onBump(1)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ds-border-default ds-tap sm:h-9 sm:w-9">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
