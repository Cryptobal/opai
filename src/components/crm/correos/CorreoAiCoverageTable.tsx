"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Stat, StatGrid } from "@/components/opai-ds";
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

const emptySlot = (): CrmStructureCoverageSlot => ({
  name: "",
  role: null,
  regimen: null,
  dias: [],
  horaInicio: "08:00",
  horaFin: "18:00",
  simultaneous: 1,
  notes: null,
  weeklyHH: 0,
  headcount: 0,
  pattern: "",
  staffingRationale: "",
});

/**
 * Tabla de cobertura por puesto + KPIs de dotación.
 * Scroll horizontal contenido en móvil; columna Puesto sticky.
 * Cuando se pasa onChange, las celdas se vuelven editables.
 */
export function CorreoAiCoverageTable({ proposal, onChange, onRecalc }: Props) {
  const t = proposal.staffingTotals;

  function updateSlot(
    instIdx: number,
    slotIdx: number,
    field: keyof CrmStructureCoverageSlot,
    value: unknown,
  ) {
    if (!onChange) return;
    const next = proposal.installations.map((inst, i) => {
      if (i !== instIdx) return inst;
      return {
        ...inst,
        coverageSlots: inst.coverageSlots.map((s, j) =>
          j === slotIdx ? { ...s, [field]: value } : s,
        ),
      };
    });
    onChange(next);
    onRecalc?.();
  }

  function addSlot(instIdx: number) {
    if (!onChange) return;
    const next = proposal.installations.map((inst, i) => {
      if (i !== instIdx) return inst;
      return { ...inst, coverageSlots: [...inst.coverageSlots, emptySlot()] };
    });
    onChange(next);
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
    onChange(next);
    onRecalc?.();
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
        <div className="overflow-x-auto rounded-xl border border-ds-border-subtle">
          <table className="w-full min-w-[540px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-ds-text-3">
                <th className="sticky left-0 z-[1] bg-ds-surface-2 px-3 py-2 font-medium">Puesto</th>
                <th className="px-3 py-2 font-medium">Régimen</th>
                <th className="px-2 py-2 font-medium tabular-nums">Sim.</th>
                <th className="px-2 py-2 font-medium">Inicio</th>
                <th className="px-2 py-2 font-medium">Fin</th>
                <th className="px-2 py-2 font-medium">Días</th>
                <th className="px-2 py-2 font-medium tabular-nums">HH</th>
                <th className="px-2 py-2 font-medium tabular-nums">Dot.</th>
                {editable && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-ds-border-subtle last:border-0">
                  <td className="sticky left-0 z-[1] bg-ds-surface-1 px-3 py-1.5 font-medium text-ds-text-1">
                    {r.slot.name || <span className="text-ds-text-4">—</span>}
                    <span className="mt-0.5 block text-[12px] font-normal text-ds-text-4">
                      {r.installation}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-ds-text-2">
                    {editable ? (
                      <Input
                        value={r.slot.regimen ?? ""}
                        onChange={(e) => updateSlot(r.instIdx, r.slotIdx, "regimen", e.target.value || null)}
                        className="h-8 min-w-[80px] text-[12px]"
                      />
                    ) : (
                      r.slot.regimen ?? "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-ds-text-2">
                    {editable ? (
                      <Input
                        type="number"
                        min={1}
                        value={r.slot.simultaneous}
                        onChange={(e) =>
                          updateSlot(r.instIdx, r.slotIdx, "simultaneous", Number(e.target.value) || 1)
                        }
                        className="h-8 w-14 text-[12px]"
                      />
                    ) : (
                      r.slot.simultaneous
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-ds-text-2">
                    {editable ? (
                      <Input
                        type="time"
                        value={r.slot.horaInicio}
                        onChange={(e) => updateSlot(r.instIdx, r.slotIdx, "horaInicio", e.target.value)}
                        className="h-8 w-20 text-[12px]"
                      />
                    ) : (
                      r.slot.horaInicio
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-ds-text-2">
                    {editable ? (
                      <Input
                        type="time"
                        value={r.slot.horaFin}
                        onChange={(e) => updateSlot(r.instIdx, r.slotIdx, "horaFin", e.target.value)}
                        className="h-8 w-20 text-[12px]"
                      />
                    ) : (
                      r.slot.horaFin
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-ds-text-2">
                    {editable ? (
                      <Input
                        value={r.slot.dias.join(", ")}
                        placeholder="lun, mar…"
                        onChange={(e) =>
                          updateSlot(
                            r.instIdx,
                            r.slotIdx,
                            "dias",
                            e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                        className="h-8 min-w-[90px] text-[12px]"
                      />
                    ) : (
                      r.slot.dias.join(", ") || "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-ds-text-2">{r.slot.weeklyHH}</td>
                  <td className="px-2 py-1.5 tabular-nums font-medium text-ds-text-1">
                    {r.slot.headcount}
                  </td>
                  {editable && (
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        aria-label="Eliminar fila"
                        onClick={() => removeSlot(r.instIdx, r.slotIdx)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ds-text-4 ds-tap hover:text-status-danger-fg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
