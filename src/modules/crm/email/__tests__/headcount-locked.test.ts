import { describe, expect, it } from "vitest";
import { coerceCrmStructureProposal } from "../email-to-crm-structure.service";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";

describe("headcountLocked en coerceCrmStructureProposal", () => {
  it("conserva headcount manual cuando headcountLocked=true", () => {
    const base = emptyCrmStructureProposal();
    const proposal = coerceCrmStructureProposal({
      ...base,
      installations: [
        {
          name: "Sitio",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [
            {
              name: "Turno diurno",
              role: "Guardia",
              regimen: "4x4",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 0,
              headcount: 9,
              headcountLocked: true,
              pattern: "",
              staffingRationale: "",
            },
          ],
        },
      ],
    });

    expect(proposal.installations[0].coverageSlots[0].headcount).toBe(9);
    expect(proposal.installations[0].coverageSlots[0].headcountLocked).toBe(true);
    expect(proposal.staffingTotals.headcountBase).toBe(9);
  });

  it("preserva festivo en dias al recalcular", () => {
    const base = emptyCrmStructureProposal();
    const proposal = coerceCrmStructureProposal({
      ...base,
      installations: [
        {
          name: "Sitio",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [
            {
              name: "Turno",
              role: null,
              regimen: "5x2",
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "festivo"],
              horaInicio: "08:00",
              horaFin: "18:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 0,
              headcount: 1,
              pattern: "",
              staffingRationale: "",
            },
          ],
        },
      ],
    });

    expect(proposal.installations[0].coverageSlots[0].dias).toContain("festivo");
    expect(proposal.installations[0].coverageSlots[0].dias).toContain("lunes");
  });
});
