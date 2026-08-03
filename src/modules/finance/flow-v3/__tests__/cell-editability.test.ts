import { describe, expect, it } from "vitest";
import { hasInvoicedIncome, hasManualPlanOverride } from "../cell-editability";

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
