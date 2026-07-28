"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Stat, StatGrid } from "@/components/opai-ds";
import { HOURS_24 } from "@/components/cpq/position-matrix/shift-utils";
import { WEEKDAYS_FULL } from "@/modules/crm/email/email-to-lead.types";
import type {
  CrmStructureCoverageSlot,
  CrmStructureInstallation,
  CrmStructureProposal,
} from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  proposal: CrmStructureProposal;
  /** If provided, table becomes editable and calls onChange after each mutation. */
  onChange?: (installations: CrmStructureInstallation[]) => void;
  onRecalc?: () => void;
};

const FESTIVO = "festivo";

const DAY_SHORT: Record<string, string> = {
  lunes: "L",
  martes: "M",
  miercoles: "M",
  jueves: "J",
  viernes: "V",
  sabado: "S",
  domingo: "D",
};

/** Régimenes típicos para cobertura continua / parcial (rol CPQ). */
const REGIMEN_OPTIONS = [
  { value: "4x4", label: "4x4" },
  { value: "7x7", label: "7x7" },
  { value: "5x2", label: "5x2" },
  { value: "24/7", label: "24/7" },
];

const emptySlot = (): CrmStructureCoverageSlot => ({
  name: "",
  role: null,
  regimen: "4x4",
  dias: [...WEEKDAYS_FULL],
  horaInicio: "08:00",
  horaFin: "20:00",
  simultaneous: 1,
  notes: null,
  weeklyHH: 0,
  headcount: 1,
  pattern: "",
  staffingRationale: "",
});

const FIELD =
  "h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[12px]";

/**
 * Tabla de cobertura por puesto + KPIs de dotación.
 * UI alineada al editor de servicios del CPQ Lead: selectores de hora no nativos,
 * botones de días con color, régimen 4x4/7x7 y dotación editable.
 */
export function CorreoAiCoverageTable({ proposal, onChange, onRecalc }: Props) {
  const t = proposal.staffingTotals;

  function commit(
    next: CrmStructureInstallation[],
    opts?: { recalc?: boolean },
  ) {
    if (!onChange) return;
    onChange(next);
    if (opts?.recalc !== false) onRecalc?.();
  }

  function updateSlot(
    instIdx: number,
    slotIdx: number,
    field: keyof CrmStructureCoverageSlot,
    value: unknown,
    opts?: { recalc?: boolean; lockHeadcount?: boolean },
  ) {
    if (!onChange) return;
    const next = proposal.installations.map((inst, i) => {
      if (i !== instIdx) return inst;
      return {
        ...inst,
        coverageSlots: inst.coverageSlots.map((s, j) => {
          if (j !== slotIdx) return s;
          const patched: CrmStructureCoverageSlot = { ...s, [field]: value };
          if (opts?.lockHeadcount) patched.headcountLocked = true;
          // Cambios de fórmula liberan el lock salvo que se esté editando headcount.
          if (
            field !== "headcount" &&
            field !== "name" &&
            field !== "role" &&
            field !== "notes" &&
            !opts?.lockHeadcount
          ) {
            delete patched.headcountLocked;
          }
          return patched;
        }),
      };
    });
    commit(next, { recalc: opts?.recalc });
  }

  function toggleDay(instIdx: number, slotIdx: number, day: string) {
    if (!onChange) return;
    const slot = proposal.installations[instIdx]?.coverageSlots[slotIdx];
    if (!slot) return;
    const has = slot.dias.includes(day);
    const dias = has ? slot.dias.filter((d) => d !== day) : [...slot.dias, day];
    updateSlot(instIdx, slotIdx, "dias", dias.length ? dias : [...WEEKDAYS_FULL]);
  }

  function bumpHeadcount(instIdx: number, slotIdx: number, delta: number) {
    const slot = proposal.installations[instIdx]?.coverageSlots[slotIdx];
    if (!slot) return;
    const next = Math.max(1, (slot.headcount || 1) + delta);
    updateSlot(instIdx, slotIdx, "headcount", next, {
      recalc: true,
      lockHeadcount: true,
    });
  }

  function bumpSimultaneous(instIdx: number, slotIdx: number, delta: number) {
    const slot = proposal.installations[instIdx]?.coverageSlots[slotIdx];
    if (!slot) return;
    updateSlot(instIdx, slotIdx, "simultaneous", Math.max(1, (slot.simultaneous || 1) + delta));
  }

  function addSlot(instIdx: number) {
    if (!onChange) return;
    const next = proposal.installations.map((inst, i) => {
      if (i !== instIdx) return inst;
      return { ...inst, coverageSlots: [...inst.coverageSlots, emptySlot()] };
    });
    commit(next);
  }

  function removeSlot(instIdx: number, slotIdx: number) {
    if (!onChange) return;
    const next = proposal.installations.map((inst, i) => {
      if (i !== instIdx) return inst;
      return {
        ...inst,
        coverageSlots: inst.coverageSlots.filter((_, j) => j !== slotIdx),
      };
    });
    commit(next);
  }

  const editable = Boolean(onChange);
  const rows = proposal.installations.flatMap((inst, instIdx) =>
    inst.coverageSlots.map((slot, slotIdx) => ({
      key: `${inst.name}-${slot.name}-${slotIdx}`,
      installation: inst.name,
      slot,
      instIdx,
      slotIdx,
    })),
  );

  return (
    <div className="space-y-3">
      {proposal.coverageIsRequirementNotStaffing && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
          Cobertura ≠ dotación: el documento pide cobertura simultánea; la dotación se calculó en servidor.
        </div>
      )}

      <StatGrid cols={2} lgCols={4}>
        <Stat label="HH / sem" value={t.weeklyHH} animate />
        <Stat label="Base" value={t.headcountBase} animate />
        <Stat label="Reserva" value={t.reserveHeadcount} animate />
        <Stat label="Total" value={t.headcountWithReserve} animate />
      </StatGrid>

      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((r) => {
            const regimenValue = r.slot.regimen ?? "";
            const regimenInList = REGIMEN_OPTIONS.some((o) => o.value === regimenValue);
            return (
              <div
                key={r.key}
                className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {editable ? (
                      <input
                        value={r.slot.name}
                        onChange={(e) =>
                          updateSlot(r.instIdx, r.slotIdx, "name", e.target.value, {
                            recalc: false,
                          })
                        }
                        placeholder="Nombre del puesto"
                        className={`${FIELD} w-full font-medium text-ds-text-1`}
                      />
                    ) : (
                      <p className="font-medium text-[13px] text-ds-text-1">
                        {r.slot.name || "—"}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] text-ds-text-4">{r.installation}</p>
                  </div>
                  {editable && (
                    <button
                      type="button"
                      aria-label="Eliminar fila"
                      onClick={() => removeSlot(r.instIdx, r.slotIdx)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ds-text-4 ds-tap hover:text-status-danger-fg sm:h-9 sm:w-9"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-ds-text-3">Régimen</span>
                    {editable ? (
                      <SimpleSelect
                        className={`${FIELD} w-full`}
                        value={regimenValue}
                        onValueChange={(v) =>
                          updateSlot(r.instIdx, r.slotIdx, "regimen", v || null)
                        }
                        options={[
                          ...(regimenValue && !regimenInList
                            ? [{ value: regimenValue, label: regimenValue }]
                            : []),
                          ...REGIMEN_OPTIONS,
                        ]}
                      />
                    ) : (
                      <p className="text-[13px] text-ds-text-2">{r.slot.regimen ?? "—"}</p>
                    )}
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-ds-text-3" title="Cobertura simultánea en sitio">
                      Sim. (cobertura)
                    </span>
                    {editable ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Menos simultáneos"
                          onClick={() => bumpSimultaneous(r.instIdx, r.slotIdx, -1)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ds-border-default ds-tap sm:h-9 sm:w-9"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.5rem] text-center text-[13px] tabular-nums font-medium text-ds-text-1">
                          {r.slot.simultaneous}
                        </span>
                        <button
                          type="button"
                          aria-label="Más simultáneos"
                          onClick={() => bumpSimultaneous(r.instIdx, r.slotIdx, 1)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ds-border-default ds-tap sm:h-9 sm:w-9"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[13px] tabular-nums text-ds-text-2">{r.slot.simultaneous}</p>
                    )}
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-ds-text-3">Inicio</span>
                    {editable ? (
                      <SimpleSelect
                        className={`${FIELD} w-full font-mono`}
                        value={r.slot.horaInicio}
                        onValueChange={(v) =>
                          updateSlot(r.instIdx, r.slotIdx, "horaInicio", v || "08:00")
                        }
                        options={HOURS_24.map((t0) => ({ value: t0, label: t0 }))}
                      />
                    ) : (
                      <p className="font-mono text-[13px] text-ds-text-2">{r.slot.horaInicio}</p>
                    )}
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-ds-text-3">Fin</span>
                    {editable ? (
                      <SimpleSelect
                        className={`${FIELD} w-full font-mono`}
                        value={r.slot.horaFin}
                        onValueChange={(v) =>
                          updateSlot(r.instIdx, r.slotIdx, "horaFin", v || "20:00")
                        }
                        options={HOURS_24.map((t0) => ({ value: t0, label: t0 }))}
                      />
                    ) : (
                      <p className="font-mono text-[13px] text-ds-text-2">{r.slot.horaFin}</p>
                    )}
                  </label>
                </div>

                <div>
                  <span className="mb-1 block text-[12px] font-medium text-ds-text-3">Días</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {WEEKDAYS_FULL.map((day, idx) => {
                      const on = r.slot.dias.includes(day);
                      const weekend = idx >= 5;
                      const activeCls = weekend
                        ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
                        : "border-primary/40 bg-primary/15 text-primary";
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={!editable}
                          onClick={() => toggleDay(r.instIdx, r.slotIdx, day)}
                          className={`h-8 min-w-[32px] rounded-md border px-1.5 text-[12px] font-medium ds-tap ${
                            on
                              ? activeCls
                              : "border-transparent bg-ds-surface-3 text-ds-text-3"
                          } disabled:opacity-80`}
                        >
                          {DAY_SHORT[day]}
                        </button>
                      );
                    })}
                    <span className="mx-0.5 h-4 w-px bg-ds-border-default" aria-hidden />
                    <button
                      type="button"
                      disabled={!editable}
                      title="Cubre festivos"
                      onClick={() => toggleDay(r.instIdx, r.slotIdx, FESTIVO)}
                      className={`h-8 min-w-[32px] rounded-md px-1.5 text-[12px] font-semibold ds-tap ${
                        r.slot.dias.includes(FESTIVO)
                          ? "border border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                          : "border border-dashed border-ds-border-default bg-ds-surface-3 text-ds-text-3"
                      } disabled:opacity-80`}
                    >
                      F
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border-subtle pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-ds-text-3">Dotación</span>
                    {editable ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Menos dotación"
                          onClick={() => bumpHeadcount(r.instIdx, r.slotIdx, -1)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ds-border-default ds-tap sm:h-9 sm:w-9"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.75rem] text-center text-[14px] tabular-nums font-semibold text-ds-text-1">
                          {r.slot.headcount}
                        </span>
                        <button
                          type="button"
                          aria-label="Más dotación"
                          onClick={() => bumpHeadcount(r.instIdx, r.slotIdx, 1)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ds-border-default ds-tap sm:h-9 sm:w-9"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        {r.slot.headcountLocked && (
                          <span className="text-[12px] text-ds-text-4">manual</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[14px] tabular-nums font-semibold text-ds-text-1">
                        {r.slot.headcount}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[12px] text-ds-text-4">
                    {r.slot.weeklyHH} HH/sem
                    {r.slot.pattern ? ` · ${r.slot.pattern}` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-ds-text-3">Sin puestos de cobertura en la propuesta.</p>
      )}

      {editable && proposal.installations.length > 0 && (
        <button
          type="button"
          onClick={() => addSlot(0)}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
        >
          <Plus className="h-4 w-4" /> Agregar puesto
        </button>
      )}
    </div>
  );
}
