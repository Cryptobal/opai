"use client";

import { Stat, StatGrid } from "@/components/opai-ds";
import { WEEKDAYS_FULL } from "@/modules/crm/email/email-to-lead.types";
import type {
  CrmStructureCoverageSlot,
  CrmStructureInstallation,
  CrmStructureProposal,
} from "@/modules/crm/email/email-to-crm-structure.types";
import { CoverageSlotRow } from "./coverage/CoverageSlotRow";
import { CoverageStageGroup } from "./coverage/CoverageStageGroup";
import { CoverageTimeline } from "./coverage/CoverageTimeline";
import {
  GENERAL_ETAPA_KEY,
  bulkSetVigencia,
  clientPeakFallback,
  duplicateSlotAt,
  emptyCoverageSlot,
  groupSlotsByEtapa,
} from "./coverage/coverage-grouping";

type Props = {
  proposal: CrmStructureProposal;
  /**
   * Commit de la cobertura editada. `recalc: false` = el cambio no afecta la
   * dotación (ej. tipear el nombre) y el consumidor puede saltarse el recálculo.
   */
  onChange?: (
    installations: CrmStructureInstallation[],
    opts?: { recalc?: boolean },
  ) => void;
};

/**
 * Tabla de cobertura agrupada por etapa + KPIs (peak / HH / base / total).
 * Firma pública estable para CorreoAiPlanSections.
 */
export function CorreoAiCoverageTable({ proposal, onChange }: Props) {
  const t = proposal.staffingTotals;
  const editable = Boolean(onChange);
  const groups = groupSlotsByEtapa(proposal.installations);
  const peak = proposal.staffingPeak ?? clientPeakFallback(proposal.installations);
  const hasSlots = groups.some((g) => g.slots.length > 0);

  function commit(
    next: CrmStructureInstallation[],
    opts?: { recalc?: boolean },
  ) {
    if (!onChange) return;
    onChange(next, opts);
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
          if (
            field !== "headcount" &&
            field !== "name" &&
            field !== "role" &&
            field !== "notes" &&
            field !== "etapa" &&
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

  function moveSlot(fromInst: number, slotIdx: number, toInst: number) {
    if (!onChange || fromInst === toInst) return;
    const src = proposal.installations[fromInst]?.coverageSlots[slotIdx];
    if (!src) return;
    const next = proposal.installations.map((inst, i) => {
      if (i === fromInst) {
        return {
          ...inst,
          coverageSlots: inst.coverageSlots.filter((_, j) => j !== slotIdx),
        };
      }
      if (i === toInst) {
        return { ...inst, coverageSlots: [...inst.coverageSlots, src] };
      }
      return inst;
    });
    commit(next);
  }

  function addSlotInGroup(groupKey: string, kind: "puesto" | "rondin") {
    if (!onChange || proposal.installations.length === 0) return;
    const group = groups.find((g) => g.key === groupKey);
    const instIdx = group?.slots[0]?.instIdx ?? 0;
    const etapa = groupKey === GENERAL_ETAPA_KEY ? null : groupKey;
    const slot = emptyCoverageSlot({
      etapa,
      vigenciaDesde: group?.vigenciaDesde ?? null,
      vigenciaHasta: group?.vigenciaHasta ?? null,
      ...(kind === "rondin"
        ? { regimen: "Rondín", name: "Rondín", horaInicio: "20:00", horaFin: "08:00" }
        : {}),
    });
    const next = proposal.installations.map((inst, i) =>
      i === instIdx
        ? { ...inst, coverageSlots: [...inst.coverageSlots, slot] }
        : inst,
    );
    commit(next);
  }

  return (
    <div className="space-y-3">
      {proposal.coverageIsRequirementNotStaffing && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
          Cobertura ≠ dotación: el documento pide cobertura simultánea; la dotación se calculó en servidor.
        </div>
      )}

      <StatGrid cols={2} lgCols={peak ? 4 : 3}>
        {peak && (
          <Stat
            label="Peak simultáneo"
            value={peak.peakHeadcount}
            animate
            hint={`${peak.peakFrom} → ${peak.peakTo}`}
          />
        )}
        <Stat label="HH / sem" value={t.weeklyHH} animate />
        <Stat
          label="Base"
          value={t.headcountBase}
          animate
          hint={peak ? "Σ etapas, no simultáneo" : undefined}
        />
        <Stat label="Total c/reserva" value={t.headcountWithReserve} animate />
      </StatGrid>

      <CoverageTimeline groups={groups} />

      {hasSlots ? (
        <div className="space-y-3">
          {groups.map((group, gi) => (
            <CoverageStageGroup
              key={group.key}
              group={group}
              colorIndex={gi}
              editable={editable}
              onBulkVigencia={(desde, hasta) => {
                commit(bulkSetVigencia(proposal.installations, group.key, desde, hasta));
              }}
              onAddSlot={(kind) => addSlotInGroup(group.key, kind)}
            >
              {group.slots.map(({ instIdx, slotIdx, slot }) => (
                <CoverageSlotRow
                  key={`${instIdx}-${slotIdx}-${slot.name}`}
                  slot={slot}
                  instIdx={instIdx}
                  slotIdx={slotIdx}
                  installations={proposal.installations}
                  editable={editable}
                  onUpdate={(field, value, opts) =>
                    updateSlot(instIdx, slotIdx, field, value, opts)
                  }
                  onMoveInstallation={(to) => moveSlot(instIdx, slotIdx, to)}
                  onToggleDay={(day) => {
                    const has = slot.dias.includes(day);
                    const dias = has
                      ? slot.dias.filter((d) => d !== day)
                      : [...slot.dias, day];
                    updateSlot(
                      instIdx,
                      slotIdx,
                      "dias",
                      dias.length ? dias : [...WEEKDAYS_FULL],
                    );
                  }}
                  onBumpSim={(delta) =>
                    updateSlot(
                      instIdx,
                      slotIdx,
                      "simultaneous",
                      Math.max(1, (slot.simultaneous || 1) + delta),
                    )
                  }
                  onBumpHeadcount={(delta) =>
                    updateSlot(
                      instIdx,
                      slotIdx,
                      "headcount",
                      Math.max(1, (slot.headcount || 1) + delta),
                      { recalc: true, lockHeadcount: true },
                    )
                  }
                  onDuplicate={() =>
                    commit(duplicateSlotAt(proposal.installations, instIdx, slotIdx))
                  }
                  onRemove={() => {
                    const next = proposal.installations.map((inst, i) =>
                      i !== instIdx
                        ? inst
                        : {
                            ...inst,
                            coverageSlots: inst.coverageSlots.filter(
                              (_, j) => j !== slotIdx,
                            ),
                          },
                    );
                    commit(next);
                  }}
                />
              ))}
            </CoverageStageGroup>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-ds-text-3">
            Sin puestos de cobertura en la propuesta.
          </p>
          {editable && proposal.installations.length > 0 && (
            <button
              type="button"
              onClick={() => addSlotInGroup(GENERAL_ETAPA_KEY, "puesto")}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
            >
              ＋ Puesto en General
            </button>
          )}
        </div>
      )}
    </div>
  );
}
