"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { CrmStructureCoverageSlot } from "@/modules/crm/email/email-to-crm-structure.types";
import { InstallationDataFields } from "../plan/forms/InstallationDataFields";
import { CoverageSlotRow, type CoverageSlotRowProps } from "./CoverageSlotRow";
import { CoverageStageGroup } from "./CoverageStageGroup";
import type { CoverageInstallationGroup, RegimenOption } from "./coverage-grouping";

type SlotHandlers = Pick<
  CoverageSlotRowProps,
  | "onUpdate"
  | "onMoveInstallation"
  | "onToggleDay"
  | "onBumpSim"
  | "onBumpHeadcount"
  | "onDuplicate"
  | "onRemove"
>;

type Props = {
  group: CoverageInstallationGroup;
  editable: boolean;
  open: boolean;
  onToggleOpen: () => void;
  focusKey: string | null;
  onFocusDone: () => void;
  regimenOptions?: RegimenOption[];
  salaryFloor?: number | null;
  otherInstallations: Array<{ idx: number; name: string }>;
  onPatchInstallation: (next: CoverageInstallationGroup["installation"]) => void;
  onRemoveInstallation: () => void;
  onBulkVigencia: (groupKey: string, desde: string | null, hasta: string | null) => void;
  onAddSlot: (kind: "puesto" | "rondin", etapaKey?: string) => void;
  slotHandlers: (instIdx: number, slotIdx: number, slot: CrmStructureCoverageSlot) => SlotHandlers;
};

export function CoverageInstallationCard({
  group,
  editable,
  open,
  onToggleOpen,
  focusKey,
  onFocusDone,
  regimenOptions,
  salaryFloor,
  otherInstallations,
  onPatchInstallation,
  onRemoveInstallation,
  onBulkVigencia,
  onAddSlot,
  slotHandlers,
}: Props) {
  const [showData, setShowData] = useState(false);
  const multiStage = group.stages.length > 1;
  const flatSlots = multiStage
    ? []
    : (group.stages[0]?.slots ?? []);

  return (
    <section className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
      <header className="flex items-start gap-2 bg-ds-surface-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-2 text-left ds-tap"
          aria-expanded={open}
        >
          <span
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-tint-teal text-[12px] font-semibold text-tint-teal-fg"
            aria-hidden
          >
            {group.instIdx + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-display text-[14px] font-semibold text-ds-text-1">
                {group.name}
              </span>
              <Tag variant="info" size="sm">nueva</Tag>
            </span>
            {group.addressSummary ? (
              <span className="mt-0.5 block truncate text-[12px] text-ds-text-3">
                {group.addressSummary}
              </span>
            ) : null}
            <span className="mt-0.5 block font-mono text-[12px] tabular-nums text-ds-text-3">
              {group.slotCount} puestos · {group.subtotalHH} HH/sem · {group.subtotalHeadcount}{" "}
              dot.
            </span>
          </span>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-ds-text-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </header>

      {open && (
        <div className="space-y-3 p-3">
          {editable && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowData((v) => !v)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ds-text-2 ds-tap hover:bg-ds-surface-2 sm:h-9"
                aria-expanded={showData}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showData ? "rotate-180" : ""}`}
                />
                Datos de la instalación
              </button>
              {showData && (
                <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-2.5">
                  <InstallationDataFields
                    installation={group.installation}
                    index={group.instIdx}
                    onChange={onPatchInstallation}
                    onRemove={onRemoveInstallation}
                  />
                </div>
              )}
            </div>
          )}

          {group.slotCount === 0 ? (
            <p className="text-[13px] text-ds-text-3">
              Sin puestos en esta instalación.
            </p>
          ) : multiStage ? (
            <div className="space-y-2">
              {group.stages.map((stage, si) => (
                <CoverageStageGroup
                  key={stage.key}
                  group={stage}
                  colorIndex={si}
                  editable={editable}
                  onBulkVigencia={(desde, hasta) =>
                    onBulkVigencia(stage.key, desde, hasta)
                  }
                  onAddSlot={(kind) => onAddSlot(kind, stage.key)}
                >
                  {stage.slots.map(({ instIdx, slotIdx, slot }) => (
                    <CoverageSlotRow
                      key={`${instIdx}-${slotIdx}`}
                      slot={slot}
                      instIdx={instIdx}
                      slotIdx={slotIdx}
                      installations={[]}
                      moveTargets={otherInstallations}
                      editable={editable}
                      autoFocusName={focusKey === `${instIdx}-${slotIdx}`}
                      onAutoFocusDone={onFocusDone}
                      regimenOptions={regimenOptions}
                      salaryFloor={salaryFloor}
                      {...slotHandlers(instIdx, slotIdx, slot)}
                    />
                  ))}
                </CoverageStageGroup>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {flatSlots.map(({ instIdx, slotIdx, slot }) => (
                <CoverageSlotRow
                  key={`${instIdx}-${slotIdx}`}
                  slot={slot}
                  instIdx={instIdx}
                  slotIdx={slotIdx}
                  installations={[]}
                  moveTargets={otherInstallations}
                  editable={editable}
                  autoFocusName={focusKey === `${instIdx}-${slotIdx}`}
                  onAutoFocusDone={onFocusDone}
                  regimenOptions={regimenOptions}
                  salaryFloor={salaryFloor}
                  {...slotHandlers(instIdx, slotIdx, slot)}
                />
              ))}
            </div>
          )}

          {editable && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onAddSlot("puesto")}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
              >
                <Plus className="h-4 w-4" /> Puesto en esta instalación
              </button>
              <button
                type="button"
                onClick={() => onAddSlot("rondin")}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
              >
                <Plus className="h-4 w-4" /> Rondín
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
