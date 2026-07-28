import { describe, expect, it } from "vitest";
import { coerceCrmStructureProposal } from "../email-to-crm-structure.service";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";
import { shiftHours } from "@/lib/crm/coverage-to-staffing";

function slot247(simultaneous: number) {
  return {
    name: "Portería 24/7",
    role: "Guardia",
    regimen: "24/7",
    dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
    horaInicio: "00:00",
    horaFin: "23:59",
    simultaneous,
    notes: null,
    weeklyHH: 0,
    headcount: 0,
    pattern: "4x4",
    staffingRationale: "",
  };
}

describe("recalc staffing (coerceCrmStructureProposal)", () => {
  it("24/7 sim 1→2 duplica headcountBase y weeklyHH", () => {
    const base = emptyCrmStructureProposal();
    const one = coerceCrmStructureProposal({
      ...base,
      installations: [
        {
          name: "Sitio A",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [slot247(1)],
        },
      ],
    });
    const two = coerceCrmStructureProposal({
      ...base,
      installations: [
        {
          name: "Sitio A",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [slot247(2)],
        },
      ],
    });

    expect(two.staffingTotals.headcountBase).toBe(one.staffingTotals.headcountBase * 2);
    expect(two.staffingTotals.weeklyHH).toBe(one.staffingTotals.weeklyHH * 2);
    expect(two.installations[0].coverageSlots[0].headcount).toBe(
      one.installations[0].coverageSlots[0].headcount * 2,
    );
  });

  it("turno que cruza medianoche (18:00→06:00) = 12 h", () => {
    expect(shiftHours("18:00", "06:00")).toBe(12);
    const base = emptyCrmStructureProposal();
    const proposal = coerceCrmStructureProposal({
      ...base,
      weeklyHoursPerWorker: 42,
      installations: [
        {
          name: "Sitio nocturno",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [
            {
              name: "Turno noche",
              role: "Guardia",
              regimen: null,
              dias: ["lunes", "martes", "miercoles", "jueves", "viernes"],
              horaInicio: "18:00",
              horaFin: "06:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 0,
              headcount: 0,
              pattern: "parcial",
              staffingRationale: "",
            },
          ],
        },
      ],
    });
    // 5 días × 12 h × 1 = 60 HH
    expect(proposal.installations[0].coverageSlots[0].weeklyHH).toBe(60);
  });

  it("reservePct editable recalcula reserva", () => {
    const base = emptyCrmStructureProposal();
    const with10 = coerceCrmStructureProposal({
      ...base,
      reservePct: 10,
      installations: [
        {
          name: "Sitio A",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [slot247(1)],
        },
      ],
    });
    const with20 = coerceCrmStructureProposal({
      ...with10,
      reservePct: 20,
    });
    expect(with20.staffingTotals.reserveHeadcount).toBeGreaterThanOrEqual(
      with10.staffingTotals.reserveHeadcount,
    );
    expect(with20.reservePct).toBe(20);
  });
});
