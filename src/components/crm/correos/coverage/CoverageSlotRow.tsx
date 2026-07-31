"use client";

import { useEffect, useRef } from "react";
import { Copy, Minus, Plus, Trash2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import { HOURS_24 } from "@/components/cpq/position-matrix/shift-utils";
import { WEEKDAYS_FULL } from "@/modules/crm/email/email-to-lead.types";
import type {
  CrmStructureCoverageSlot,
  CrmStructureInstallation,
} from "@/modules/crm/email/email-to-crm-structure.types";
import { isRondinRegimen } from "./coverage-grouping";

const FESTIVO = "festivo";
const DAY_SHORT: Record<string, string> = {
  lunes: "L", martes: "M", miercoles: "M", jueves: "J",
  viernes: "V", sabado: "S", domingo: "D",
};
const REGIMEN_OPTIONS = [
  { value: "4x4", label: "4x4" },
  { value: "7x7", label: "7x7" },
  { value: "5x2", label: "5x2" },
  { value: "24/7", label: "24/7" },
  { value: "Rondín", label: "Rondín" },
];
const FIELD =
  "h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[12px]";

export type CoverageSlotRowProps = {
  slot: CrmStructureCoverageSlot;
  instIdx: number;
  slotIdx: number;
  installations: CrmStructureInstallation[];
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
};

export function CoverageSlotRow({
  slot, instIdx, installations, editable,
  onUpdate, onMoveInstallation, onToggleDay,
  onBumpSim, onBumpHeadcount, onDuplicate, onRemove,
  autoFocusName = false, onAutoFocusDone,
}: CoverageSlotRowProps) {
  const regimenValue = slot.regimen ?? "";
  const regimenInList = REGIMEN_OPTIONS.some((o) => o.value === regimenValue);
  const nameRef = useRef<HTMLInputElement | null>(null);

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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {installations.length > 1 && (
          <label className="block space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[12px] font-medium text-ds-text-3">Instalación</span>
            {editable ? (
              <SimpleSelect
                className={`${FIELD} w-full`}
                value={String(instIdx)}
                onValueChange={(v) => onMoveInstallation(Number(v))}
                options={installations.map((inst, i) => ({
                  value: String(i),
                  label: inst.name || `Instalación ${i + 1}`,
                }))}
              />
            ) : (
              <p className="text-[13px] text-ds-text-2 truncate">
                {installations[instIdx]?.name ?? "—"}
              </p>
            )}
          </label>
        )}
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
                ...REGIMEN_OPTIONS,
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border-subtle pt-2">
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
