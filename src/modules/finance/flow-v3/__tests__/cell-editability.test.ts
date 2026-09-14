import { describe, expect, it } from "vitest";
import { hasInvoicedIncome, hasManualPlanOverride, hasPostponedIvaF29, planYieldsToCommitted } from "../cell-editability";

describe("hasInvoicedIncome", () => {
  it("solo INGRESOS con ítem dte", () => {
    expect(
      hasInvoicedIncome("INGRESOS", {
        total: 100,
        items: [{ kind: "dte", label: "X", fecha: "2026-08-03", monto: 100 }],
      }),
    ).toBe(true);
    expect(
      hasInvoicedIncome("INGRESOS", {
        total: 100,
        items: [{ kind: "scheduled", label: "X", fecha: "2026-08-03", monto: 100 }],
      }),
    ).toBe(false);
    expect(
      hasInvoicedIncome("REMUNERACIONES", {
        total: 100,
        items: [{ kind: "dte", label: "X", fecha: "2026-08-03", monto: 100 }],
      }),
    ).toBe(false);
    expect(hasInvoicedIncome("INGRESOS", null)).toBe(false);
  });
});

describe("hasManualPlanOverride", () => {
  it("plan efectivo no vacío", () => {
    expect(hasManualPlanOverride(100, "plan")).toBe(true);
    expect(hasManualPlanOverride(0, "plan")).toBe(false);
    expect(hasManualPlanOverride(100, "committed")).toBe(false);
  });
});

describe("hasPostponedIvaF29", () => {
  const postponed = {
    total: 300_000,
    items: [{
      kind: "scheduled" as const,
      milestoneKey: "f29",
      label: "IVA F29 2026-08 (solo PPM · IVA postergado)",
      fecha: "2026-09-12",
      monto: 300_000,
      ivaPostponed: true,
    }],
  };

  it("solo en IVA_F29 con marca ivaPostponed", () => {
    expect(hasPostponedIvaF29("IVA_F29", postponed)).toBe(true);
    expect(hasPostponedIvaF29("IVA_POSTERGADO", postponed)).toBe(false);
    expect(hasPostponedIvaF29("IVA_F29", {
      total: 2_500_000,
      items: [{
        kind: "scheduled",
        milestoneKey: "f29",
        label: "IVA F29 2026-08",
        fecha: "2026-09-12",
        monto: 2_500_000,
      }],
    })).toBe(false);
    expect(planYieldsToCommitted("IMPUESTOS", "IVA_F29", postponed)).toBe(true);
  });
});
