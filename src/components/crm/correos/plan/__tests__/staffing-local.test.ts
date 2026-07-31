import { describe, expect, it } from "vitest";
import {
  LEGAL_WEEKLY_HOURS,
  normalizeReservePct,
  normalizeWeeklyHours,
  recalcProposalStaffing,
} from "../staffing-local";
import { normalizeCrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.service";
import { emptyCrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";
import type {
  CrmStructureCoverageSlot,
  CrmStructureProposal,
} from "@/modules/crm/email/email-to-crm-structure.types";

const WEEK = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

function slot(
  overrides: Partial<CrmStructureCoverageSlot> = {},
): CrmStructureCoverageSlot {
  return {
    name: "Puesto 1",
    role: null,
    regimen: "4x4",
    dias: [...WEEK],
    horaInicio: "08:00",
    horaFin: "20:00",
    simultaneous: 1,
    notes: null,
    weeklyHH: 0,
    headcount: 1,
    pattern: "",
    staffingRationale: "",
    etapa: null,
    vigenciaDesde: null,
    vigenciaHasta: null,
    ...overrides,
  };
}

function proposalWith(
  slots: CrmStructureCoverageSlot[],
  overrides: Partial<CrmStructureProposal> = {},
): CrmStructureProposal {
  return {
    ...emptyCrmStructureProposal(),
    installations: [
      {
        name: "Planta",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: slots,
      },
    ],
    ...overrides,
  };
}

describe("normalizeWeeklyHours / normalizeReservePct", () => {
  it("coerciona jornadas legacy 44 / 45 al tope legal 42", () => {
    expect(normalizeWeeklyHours(44)).toBe(LEGAL_WEEKLY_HOURS);
    expect(normalizeWeeklyHours(45)).toBe(LEGAL_WEEKLY_HOURS);
    expect(normalizeWeeklyHours(undefined)).toBe(LEGAL_WEEKLY_HOURS);
    expect(normalizeWeeklyHours(0)).toBe(LEGAL_WEEKLY_HOURS);
    // Jornadas parciales declaradas por debajo del tope se respetan.
    expect(normalizeWeeklyHours(30)).toBe(30);
  });

  it("reserva fuera de 0–100 cae al default 10", () => {
    expect(normalizeReservePct(0)).toBe(0);
    expect(normalizeReservePct(15)).toBe(15);
    expect(normalizeReservePct(-1)).toBe(10);
    expect(normalizeReservePct(101)).toBe(10);
    expect(normalizeReservePct(undefined)).toBe(10);
  });
});

describe("recalcProposalStaffing", () => {
  it("24/7 en un solo slot → 4 personas por simultáneo", () => {
    const out = recalcProposalStaffing(
      proposalWith([
        slot({ regimen: "24/7", horaInicio: "08:00", horaFin: "08:00" }),
      ]),
    );
    const s = out.installations[0].coverageSlots[0];
    expect(s.headcount).toBe(4);
    expect(s.pattern).toBe("4x4");
    expect(s.weeklyHH).toBe(168);
    expect(out.staffingTotals.headcountBase).toBe(4);
  });

  it("respeta headcountLocked pero sí actualiza HH y patrón", () => {
    const out = recalcProposalStaffing(
      proposalWith([slot({ headcount: 9, headcountLocked: true })]),
    );
    const s = out.installations[0].coverageSlots[0];
    expect(s.headcount).toBe(9);
    expect(s.weeklyHH).toBe(84);
    expect(s.pattern).toBe("4x4");
    expect(out.staffingTotals.headcountBase).toBe(9);
  });

  it("aplica la reserva sobre la dotación base", () => {
    const out = recalcProposalStaffing(
      proposalWith([slot()], { reservePct: 20 }),
    );
    // 7×12h → 2 en 4x4; 20% de 2 = 0.4 → ceil = 1.
    expect(out.staffingTotals.headcountBase).toBe(2);
    expect(out.staffingTotals.reserveHeadcount).toBe(1);
    expect(out.staffingTotals.headcountWithReserve).toBe(3);
  });

  it("no descarta puestos sin nombre ni agregados a mano", () => {
    const out = recalcProposalStaffing(proposalWith([slot({ name: "" })]));
    expect(out.installations[0].coverageSlots).toHaveLength(1);
    expect(out.installations[0].coverageSlots[0].name).toBe("");
  });

  it("recalcula el peak desde las vigencias de los slots", () => {
    const out = recalcProposalStaffing(
      proposalWith([
        slot({ vigenciaDesde: "2026-09-01", vigenciaHasta: "2026-09-30" }),
        slot({ vigenciaDesde: "2026-09-15", vigenciaHasta: "2026-10-15" }),
      ]),
    );
    // Ambos activos entre 09-15 y 09-30 → 2 + 2.
    expect(out.staffingPeak?.peakHeadcount).toBe(4);
    expect(out.staffingPeak?.peakFrom).toBe("2026-09-15");
    expect(out.staffingPeak?.peakTo).toBe("2026-09-30");
  });

  it("es idempotente (aplicarlo dos veces no cambia nada)", () => {
    const once = recalcProposalStaffing(
      proposalWith([slot({ regimen: "24/7" }), slot({ dias: WEEK.slice(0, 5) })]),
    );
    expect(recalcProposalStaffing(once)).toEqual(once);
  });

  it("converge con la normalización server (mismo resultado que enrichSlot)", () => {
    const slots = [
      slot({ name: "Portería", regimen: "24/7", horaInicio: "08:00", horaFin: "08:00" }),
      slot({ name: "Diurno", dias: WEEK.slice(0, 5), horaInicio: "08:00", horaFin: "18:00" }),
      slot({ name: "Manual", headcount: 7, headcountLocked: true }),
    ];
    const local = recalcProposalStaffing(proposalWith(slots, { reservePct: 12 }));
    const server = normalizeCrmStructureProposal(
      proposalWith(slots, { reservePct: 12 }) as unknown as Record<string, unknown>,
    );

    expect(local.staffingTotals).toEqual(server.staffingTotals);
    expect(local.staffingPeak).toEqual(server.staffingPeak);
    expect(
      local.installations[0].coverageSlots.map((s) => ({
        name: s.name,
        weeklyHH: s.weeklyHH,
        headcount: s.headcount,
        pattern: s.pattern,
      })),
    ).toEqual(
      server.installations[0].coverageSlots.map((s) => ({
        name: s.name,
        weeklyHH: s.weeklyHH,
        headcount: s.headcount,
        pattern: s.pattern,
      })),
    );
  });
});
