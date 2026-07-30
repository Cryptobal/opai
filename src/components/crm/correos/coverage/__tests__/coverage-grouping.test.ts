import { describe, expect, it } from "vitest";
import type { CrmStructureInstallation } from "@/modules/crm/email/email-to-crm-structure.types";
import {
  GENERAL_ETAPA_KEY,
  bulkSetVigencia,
  clientPeakFallback,
  duplicateSlotAt,
  groupSlotsByEtapa,
  isRondinRegimen,
} from "../coverage-grouping";

function slot(
  partial: Partial<CrmStructureInstallation["coverageSlots"][number]> & { name: string },
) {
  return {
    role: null,
    regimen: "4x4",
    dias: ["lunes"],
    horaInicio: "08:00",
    horaFin: "20:00",
    simultaneous: 1,
    notes: null,
    weeklyHH: 40,
    headcount: 2,
    pattern: "4x4",
    staffingRationale: "",
    ...partial,
  };
}

describe("coverage-grouping", () => {
  const installations: CrmStructureInstallation[] = [
    {
      name: "Obra",
      address: null,
      commune: null,
      city: null,
      mapsUrl: null,
      coverageSlots: [
        slot({
          name: "A",
          etapa: "Etapa 2",
          vigenciaDesde: "2026-09-01",
          vigenciaHasta: "2026-09-30",
          headcount: 2,
          weeklyHH: 84,
        }),
        slot({
          name: "B",
          etapa: "Etapa 1",
          vigenciaDesde: "2026-09-01",
          vigenciaHasta: "2026-09-30",
          headcount: 2,
          weeklyHH: 84,
        }),
        slot({ name: "C", headcount: 1, weeklyHH: 40 }),
      ],
    },
  ];

  it("groupSlotsByEtapa ordena por vigencia y deja General al final", () => {
    const groups = groupSlotsByEtapa(installations);
    expect(groups.map((g) => g.key)).toEqual(["Etapa 1", "Etapa 2", GENERAL_ETAPA_KEY]);
    expect(groups[0].slots).toHaveLength(1);
    expect(groups[0].slots[0].slot.name).toBe("B");
    expect(groups[2].label).toBe(GENERAL_ETAPA_KEY);
    expect(groups[0].subtotalHeadcount).toBe(2);
  });

  it("duplicateSlotAt inserta copia con lock preservado", () => {
    const withLock: CrmStructureInstallation[] = [
      {
        ...installations[0],
        coverageSlots: [
          slot({ name: "X", headcount: 5, headcountLocked: true, etapa: "Etapa 1" }),
        ],
      },
    ];
    const next = duplicateSlotAt(withLock, 0, 0);
    expect(next[0].coverageSlots).toHaveLength(2);
    expect(next[0].coverageSlots[1].name).toBe("X (copia)");
    expect(next[0].coverageSlots[1].headcountLocked).toBe(true);
    expect(next[0].coverageSlots[1].headcount).toBe(5);
  });

  it("bulkSetVigencia actualiza todos los slots del grupo", () => {
    const next = bulkSetVigencia(installations, "Etapa 2", "2026-10-01", "2026-10-31");
    expect(next[0].coverageSlots[0].vigenciaDesde).toBe("2026-10-01");
    expect(next[0].coverageSlots[0].vigenciaHasta).toBe("2026-10-31");
    expect(next[0].coverageSlots[1].vigenciaDesde).toBe("2026-09-01"); // otra etapa
  });

  it("clientPeakFallback delega en computePeakStaffing", () => {
    const peak = clientPeakFallback(installations);
    expect(peak).not.toBeNull();
    // E1(2)+E2(2)+General open(1) = 5 en sep
    expect(peak!.peakHeadcount).toBe(5);
  });

  it("isRondinRegimen detecta rondín", () => {
    expect(isRondinRegimen("Rondín")).toBe(true);
    expect(isRondinRegimen("rondas nocturnas")).toBe(true);
    expect(isRondinRegimen("24/7")).toBe(false);
  });
});
