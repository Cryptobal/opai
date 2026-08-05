"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Stat, StatGrid } from "@/components/opai-ds";
import { WEEKDAYS_FULL } from "@/modules/crm/email/email-to-lead.types";
import type {
  CrmStructureCoverageSlot,
  CrmStructureInstallation,
  CrmStructureProposal,
} from "@/modules/crm/email/email-to-crm-structure.types";
import { CoverageInstallationCard } from "./coverage/CoverageInstallationCard";
import { CoverageTimeline } from "./coverage/CoverageTimeline";
import {
  GENERAL_ETAPA_KEY,
  bulkSetVigencia,
  clientPeakFallback,
  duplicateSlotAt,
  emptyCoverageSlot,
  groupSlotsByEtapa,
  groupSlotsByInstallation,
  nextSlotName,
  type RegimenOption,
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
  /** Roles de turno del tenant (catálogo CPQ); sin dato usa la lista estática. */
  regimenOptions?: RegimenOption[];
};

const emptyInstallation = (): CrmStructureInstallation => ({
  name: "",
  address: null,
  commune: null,
  city: null,
  mapsUrl: null,
  lat: null,
  lng: null,
  coverageSlots: [],
});

/**
 * Cobertura agrupada por instalación (+ etapas anidadas) con KPIs globales.
 * Firma pública estable para CorreoAiActionPanel / plan draft.
 */
export function CorreoAiCoverageTable({ proposal, onChange, regimenOptions }: Props) {
  const t = proposal.staffingTotals;
  const editable = Boolean(onChange);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const stageGroups = groupSlotsByEtapa(proposal.installations);
  const instGroups = groupSlotsByInstallation(proposal.installations);
  const peak = proposal.staffingPeak ?? clientPeakFallback(proposal.installations);
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
            field !== "baseSalary" &&
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

  function ensureInstallations(
    installations: CrmStructureInstallation[],
  ): CrmStructureInstallation[] {
    if (installations.length > 0) return installations;
    return [
      {
        name: "Instalación principal",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        coverageSlots: [],
      },
    ];
  }

  function addSlotInInstallation(
    instIdx: number,
    kind: "puesto" | "rondin",
    etapaKey?: string,
  ) {
    if (!onChange) return;
    let base = ensureInstallations(proposal.installations);
    // Si no había instalaciones, el idx pedido puede ser 0 tras semilla.
    const targetIdx = Math.min(instIdx, base.length - 1);
    const groupKey = etapaKey ?? GENERAL_ETAPA_KEY;
    const etapa = groupKey === GENERAL_ETAPA_KEY ? null : groupKey;
    const existing = base[targetIdx]?.coverageSlots ?? [];
    const sameEtapa = existing.filter((s) => {
      const k = (s.etapa || "").trim() || GENERAL_ETAPA_KEY;
      return k === groupKey;
    });
    const floor = proposal.condicionesEconomicas?.sueldoBaseMinimo;
    const stageMeta = stageGroups.find((g) => g.key === groupKey);
    const slot = emptyCoverageSlot({
      etapa,
      name: nextSlotName(sameEtapa.length ? sameEtapa : existing, kind === "rondin" ? "Rondín" : "Puesto"),
      vigenciaDesde: stageMeta?.vigenciaDesde ?? null,
      vigenciaHasta: stageMeta?.vigenciaHasta ?? null,
      ...(typeof floor === "number" && floor > 0 ? { baseSalary: floor } : {}),
      ...(kind === "rondin"
        ? { regimen: "Rondín", horaInicio: "20:00", horaFin: "08:00" }
        : {}),
    });
    const newSlotIdx = base[targetIdx]?.coverageSlots.length ?? 0;
    const next = base.map((inst, i) =>
      i === targetIdx
        ? { ...inst, coverageSlots: [...inst.coverageSlots, slot] }
        : inst,
    );
    // Abrir la instalación y el puesto recién creado (resto queda contraído).
    setCollapsed((prev) => ({ ...prev, [targetIdx]: false }));
    setFocusKey(`${targetIdx}-${newSlotIdx}`);
    commit(next);
  }

  function addInstallation() {
    if (!onChange) return;
    const next = [...proposal.installations, emptyInstallation()];
    setCollapsed((prev) => ({ ...prev, [next.length - 1]: false }));
    commit(next, { recalc: false });
  }

  return (
    <div className="space-y-3">
      {proposal.coverageIsRequirementNotStaffing && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
          Cobertura ≠ dotación: el documento pide cobertura simultánea; la dotación se calculó en servidor.
        </div>
      )}

      <StatGrid cols={2} lgCols={peak ? 3 : 2}>
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
          label="Dotación"
          value={t.headcountBase}
          animate
          hint={peak ? "Σ etapas, no simultáneo" : undefined}
        />
      </StatGrid>

      <CoverageTimeline groups={stageGroups} />

      {instGroups.length > 0 ? (
        <div className="space-y-3">
          {instGroups.map((group) => {
            // Contraídas por defecto; solo abiertas si el usuario (o un alta) las abre.
            const isOpen = collapsed[group.instIdx] === false;
            const others = instGroups
              .filter((g) => g.instIdx !== group.instIdx)
              .map((g) => ({ idx: g.instIdx, name: g.name }));
            return (
              <CoverageInstallationCard
                key={group.instIdx}
                group={group}
                editable={editable}
                open={isOpen}
                onToggleOpen={() =>
                  setCollapsed((prev) => ({
                    ...prev,
                    [group.instIdx]: isOpen,
                  }))
                }
                focusKey={focusKey}
                onFocusDone={() => setFocusKey(null)}
                regimenOptions={regimenOptions}
                salaryFloor={proposal.condicionesEconomicas?.sueldoBaseMinimo}
                otherInstallations={others}
                onPatchInstallation={(nextInst) => {
                  commit(
                    proposal.installations.map((inst, i) =>
                      i === group.instIdx ? nextInst : inst,
                    ),
                    { recalc: false },
                  );
                }}
                onRemoveInstallation={() => {
                  commit(
                    proposal.installations.filter((_, i) => i !== group.instIdx),
                    { recalc: true },
                  );
                }}
                onBulkVigencia={(groupKey, desde, hasta) => {
                  commit(
                    bulkSetVigencia(
                      proposal.installations,
                      groupKey,
                      desde,
                      hasta,
                      group.instIdx,
                    ),
                  );
                }}
                onAddSlot={(kind, etapaKey) =>
                  addSlotInInstallation(group.instIdx, kind, etapaKey)
                }
                slotHandlers={(instIdx, slotIdx, slot) => ({
                  onUpdate: (field, value, opts) =>
                    updateSlot(instIdx, slotIdx, field, value, opts),
                  onMoveInstallation: (to) => moveSlot(instIdx, slotIdx, to),
                  onToggleDay: (day) => {
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
                  },
                  onBumpSim: (delta) =>
                    updateSlot(
                      instIdx,
                      slotIdx,
                      "simultaneous",
                      Math.max(1, (slot.simultaneous || 1) + delta),
                    ),
                  onBumpHeadcount: (delta) =>
                    updateSlot(
                      instIdx,
                      slotIdx,
                      "headcount",
                      Math.max(1, (slot.headcount || 1) + delta),
                      { recalc: true, lockHeadcount: true },
                    ),
                  onDuplicate: () =>
                    commit(duplicateSlotAt(proposal.installations, instIdx, slotIdx)),
                  onRemove: () => {
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
                  },
                })}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-ds-text-3">
            Sin instalaciones aún. Agregá una para cargar puestos.
          </p>
          {editable && (
            <button
              type="button"
              onClick={() => addSlotInInstallation(0, "puesto")}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
            >
              ＋ Puesto en General
            </button>
          )}
        </div>
      )}

      {editable && (
        <button
          type="button"
          onClick={addInstallation}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
        >
          <Plus className="h-4 w-4" /> Agregar instalación
        </button>
      )}
    </div>
  );
}
