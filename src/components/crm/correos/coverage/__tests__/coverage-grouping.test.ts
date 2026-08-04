import { describe, expect, it } from "vitest";
import type { CrmStructureInstallation } from "@/modules/crm/email/email-to-crm-structure.types";
import {
  GENERAL_ETAPA_KEY,
  buildRegimenOptions,
  bulkSetVigencia,
  clientPeakFallback,
  duplicateSlotAt,
  groupSlotsByEtapa,
  groupSlotsByInstallation,
  isRondinRegimen,
  nextSlotName,
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

  it("groupSlotsByInstallation separa por índice con etapas anidadas", () => {
    const multi: CrmStructureInstallation[] = [
      {
        name: "Planta",
        address: "Av. Uno",
        commune: "Maipú",
        city: "Santiago",
        mapsUrl: null,
        coverageSlots: [
          slot({
            name: "A",
            etapa: "Etapa 1",
            vigenciaDesde: "2026-09-01",
            vigenciaHasta: "2026-09-30",
            headcount: 14,
            weeklyHH: 549,
          }),
        ],
      },
      {
        name: "Centro Logístico",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [
          slot({
            name: "B",
            etapa: "Etapa 2",
            vigenciaDesde: "2026-10-01",
            vigenciaHasta: "2026-10-31",
            headcount: 12,
            weeklyHH: 504,
          }),
          slot({ name: "C", headcount: 1, weeklyHH: 40 }),
        ],
      },
      {
        name: "Vacía",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [],
      },
      {
        name: "Planta",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot({ name: "D", headcount: 2, weeklyHH: 80 })],
      },
    ];
    const groups = groupSlotsByInstallation(multi);
    expect(groups).toHaveLength(4);
    expect(groups[0].name).toBe("Planta");
    expect(groups[0].addressSummary).toBe("Av. Uno, Maipú, Santiago");
    expect(groups[0].slotCount).toBe(1);
    expect(groups[0].subtotalHH).toBe(549);
    expect(groups[0].subtotalHeadcount).toBe(14);
    expect(groups[0].stages.map((s) => s.key)).toEqual(["Etapa 1"]);
    expect(groups[1].stages.map((s) => s.key)).toEqual(["Etapa 2", GENERAL_ETAPA_KEY]);
    expect(groups[1].subtotalHH).toBe(544);
    expect(groups[2].slotCount).toBe(0);
    expect(groups[2].stages).toHaveLength(0);
    // Nombres duplicados quedan separados por índice.
    expect(groups[3].instIdx).toBe(3);
    expect(groups[3].name).toBe("Planta");
    expect(groups[3].slotCount).toBe(1);
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

describe("buildRegimenOptions", () => {
  it("sin catálogo devuelve la lista estática + sintéticos", () => {
    expect(buildRegimenOptions().map((o) => o.value)).toEqual([
      "4x4",
      "7x7",
      "5x2",
      "24/7",
      "Rondín",
    ]);
    expect(buildRegimenOptions([]).map((o) => o.value)).toEqual([
      "4x4",
      "7x7",
      "5x2",
      "24/7",
      "Rondín",
    ]);
  });

  it("con catálogo CPQ usa los roles del tenant y agrega sintéticos al final", () => {
    expect(
      buildRegimenOptions(["4x4", "2x5", " 1x6 ", "4X4", ""]).map((o) => o.value),
    ).toEqual(["4x4", "2x5", "1x6", "24/7", "Rondín"]);
  });

  it("no duplica un rol CPQ que ya se llama como un sintético", () => {
    expect(buildRegimenOptions(["Rondín", "5x2"]).map((o) => o.value)).toEqual([
      "Rondín",
      "5x2",
      "24/7",
    ]);
  });
});

describe("nextSlotName", () => {
  it("numera correlativo ignorando nombres libres", () => {
    expect(nextSlotName([])).toBe("Puesto 1");
    expect(nextSlotName([{ name: "Portería" }])).toBe("Puesto 1");
    expect(nextSlotName([{ name: "Puesto 1" }, { name: "Puesto 3" }])).toBe(
      "Puesto 4",
    );
    expect(nextSlotName([{ name: "Rondín 2" }], "Rondín")).toBe("Rondín 3");
  });
});
