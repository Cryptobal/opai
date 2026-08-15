import { describe, expect, it } from "vitest";
import { economicOpeningFromBreakdown, formatOpeningPct } from "@/lib/cpq/economic-opening";
import {
  detectHeadingsFromCorpus,
  mergeInstitutionalWithBases,
  proposeCommercialInstitutionalIndex,
} from "../propose-index";

describe("economicOpeningFromBreakdown", () => {
  it("arma la apertura con ceros si no hay costeo", () => {
    const opening = economicOpeningFromBreakdown(null);
    expect(opening.rows).toHaveLength(5);
    expect(opening.rows.every((r) => r.amountClp === 0)).toBe(true);
    expect(opening.note).toMatch(/IVA/);
  });

  it("usa el margen configurado y el total de venta", () => {
    const opening = economicOpeningFromBreakdown({
      positions: [],
      totalLaborCost: 400,
      holidayAdjustment: 10,
      uniforms: 20,
      exams: 5,
      meals: 15,
      vehicles: 30,
      infrastructure: 10,
      equipment: 40,
      transport: 5,
      systems: 5,
      other: 10,
      subtotalBase: 550,
      marginPct: 12,
      marginAmount: 80,
      financial: 0,
      financialRatePct: 0,
      policy: 0,
      policyRatePct: 0,
      totalSalePrice: 630,
      additionalLines: 0,
      grandTotal: 630,
      monthlyHoursStandard: 180,
      currency: "UF",
      ufValue: 39000,
    });
    expect(opening.rows.find((r) => r.key === "labor")?.amountClp).toBe(400);
    expect(opening.rows.find((r) => r.key === "direct")?.amountClp).toBe(50);
    expect(opening.rows.find((r) => r.key === "indirect")?.amountClp).toBe(100);
    expect(opening.rows.find((r) => r.key === "margin")?.pct).toBe(12);
    expect(opening.rows.find((r) => r.key === "sale")?.amountClp).toBe(630);
    expect(formatOpeningPct(12)).toMatch(/12[,.]0%/);
  });
});

describe("índice institucional + bases", () => {
  it("mergeInstitutionalWithBases inserta la auto antes de la matriz", () => {
    const institutional = proposeCommercialInstitutionalIndex().items;
    const bases = detectHeadingsFromCorpus({
      dealId: "d1",
      chunks: [],
      truncated: false,
      hasBases: true,
      basesError: null,
      banner: "",
    });
    const items = mergeInstitutionalWithBases(institutional, bases);
    const ofertaIdx = items.findIndex((i) => i.kind === "oferta_economica");
    const matrizIdx = items.findIndex((i) => i.invariant === "matriz");
    expect(ofertaIdx).toBeGreaterThan(-1);
    expect(ofertaIdx).toBeLessThan(matrizIdx);
    expect(items.some((i) => i.fixedKey === "quienes_somos")).toBe(true);
  });
});
