import { describe, it, expect } from "vitest";
import type { ProjectionRowItemValue } from "@/modules/finance/cashflow/types";
import { canEditValue } from "../grid-helpers";

function val(
  partial: Partial<ProjectionRowItemValue> & { amount: number },
): ProjectionRowItemValue {
  return {
    bucketKey: "W27",
    actualAmount: null,
    occurrenceId: "occ-1",
    scheduledDate: "2026-07-01",
    dteId: null,
    cellStatus: "PROJECTED",
    ...partial,
  };
}

describe("canEditValue", () => {
  it("manual income ✔", () => {
    expect(
      canEditValue(val({ amount: 1000, cellStatus: "PROJECTED" }), "MANUAL", "INCOME", false),
    ).toBe(true);
  });

  it("draft income ✔", () => {
    expect(
      canEditValue(
        val({ amount: 1000, cellStatus: "DRAFT" }),
        "RECURRING_DTE",
        "INCOME",
        false,
      ),
    ).toBe(true);
  });

  it("invoiced income ✘", () => {
    expect(
      canEditValue(
        val({ amount: 1000, cellStatus: "INVOICED" }),
        "RECURRING_DTE",
        "INCOME",
        false,
      ),
    ).toBe(false);
  });

  it("paid ✘", () => {
    expect(
      canEditValue(val({ amount: 1000, cellStatus: "PAID" }), "MANUAL", "EXPENSE", false),
    ).toBe(false);
  });

  it("expense abierto ✔", () => {
    expect(
      canEditValue(
        val({ amount: 500, cellStatus: "PROJECTED" }),
        "MANUAL",
        "EXPENSE",
        false,
      ),
    ).toBe(true);
  });

  it("semana cerrada ✘", () => {
    expect(
      canEditValue(val({ amount: 1000, cellStatus: "PROJECTED" }), "MANUAL", "EXPENSE", true),
    ).toBe(false);
  });
});
