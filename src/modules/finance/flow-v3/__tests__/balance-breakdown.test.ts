import { describe, it, expect } from "vitest";
import {
  currentWeekBalanceTitle,
  weekPendingBreakdown,
} from "../balance-breakdown";
import type { FlowMatrixRowDto } from "../matrix-types";

function cell(over: Partial<FlowMatrixRowDto["cells"][number]>): FlowMatrixRowDto["cells"][number] {
  return {
    weekStart: "2026-08-17",
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    ...over,
  };
}

describe("weekPendingBreakdown", () => {
  it("separa ingresos y egresos pendientes (effective − real)", () => {
    const rows = [
      {
        id: "a",
        cells: [cell({ effective: 5_000_000, layer: "committed" })],
      },
      {
        id: "b",
        cells: [cell({ effective: -3_000_000, layer: "plan" })],
      },
      {
        id: "c",
        cells: [
          cell({
            effective: -1_000_000,
            real: { total: -400_000, items: [] },
            layer: "real",
          }),
        ],
      },
    ] as FlowMatrixRowDto[];
    const b = weekPendingBreakdown(rows, 0);
    expect(b.pendingIncome).toBe(5_000_000);
    // −3M plan + (−1M − (−0.4M)) = 3M + 0.6M
    expect(b.pendingExpense).toBe(3_600_000);
    expect(b.pendingNet).toBe(5_000_000 - 3_600_000);
  });
});

describe("currentWeekBalanceTitle", () => {
  it("explica banco + pendientes = saldo", () => {
    const title = currentWeekBalanceTitle(
      11_384_961,
      { pendingIncome: 12_880_404, pendingExpense: 47_139_840, pendingNet: -34_259_436 },
      -22_874_475,
    );
    expect(title).toContain("Banco hoy 11.384.961");
    expect(title).toContain("ingresos pendientes 12.880.404");
    expect(title).toContain("egresos pendientes 47.139.840");
    expect(title).toContain("= -22.874.475");
  });
});
