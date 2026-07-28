"use client";

import { Stat, StatGrid } from "@/components/opai-ds";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  proposal: CrmStructureProposal;
};

/**
 * Tabla de cobertura por puesto + KPIs de dotación.
 * Scroll horizontal contenido en móvil; columna Puesto sticky.
 */
export function CorreoAiCoverageTable({ proposal }: Props) {
  const rows = proposal.installations.flatMap((inst) =>
    inst.coverageSlots.map((slot) => ({
      key: `${inst.name}-${slot.name}`,
      installation: inst.name,
      puesto: slot.name,
      regimen: slot.regimen ?? "—",
      simultaneous: slot.simultaneous,
      weeklyHH: slot.weeklyHH,
      headcount: slot.headcount,
      pattern: slot.pattern,
    })),
  );
  const t = proposal.staffingTotals;

  return (
    <div className="space-y-3">
      {proposal.coverageIsRequirementNotStaffing && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
          Cobertura ≠ dotación: el documento pide cobertura simultánea; la
          dotación se calculó en servidor.
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
          <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-ds-border-subtle bg-ds-surface-2 text-ds-text-3">
                <th className="sticky left-0 z-[1] bg-ds-surface-2 px-3 py-2 font-medium">
                  Puesto
                </th>
                <th className="px-3 py-2 font-medium">Instalación</th>
                <th className="px-3 py-2 font-medium">Régimen</th>
                <th className="px-3 py-2 font-medium tabular-nums">Sim.</th>
                <th className="px-3 py-2 font-medium tabular-nums">HH sem</th>
                <th className="px-3 py-2 font-medium tabular-nums">Dot.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-ds-border-subtle last:border-0">
                  <td className="sticky left-0 z-[1] bg-ds-surface-1 px-3 py-2 font-medium text-ds-text-1">
                    {r.puesto}
                    <span className="mt-0.5 block text-[12px] font-normal text-ds-text-4">
                      {r.pattern}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ds-text-2">{r.installation}</td>
                  <td className="px-3 py-2 text-ds-text-2">{r.regimen}</td>
                  <td className="px-3 py-2 tabular-nums text-ds-text-2">{r.simultaneous}</td>
                  <td className="px-3 py-2 tabular-nums text-ds-text-2">{r.weeklyHH}</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-ds-text-1">
                    {r.headcount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-ds-text-3">Sin puestos de cobertura en la propuesta.</p>
      )}
    </div>
  );
}
