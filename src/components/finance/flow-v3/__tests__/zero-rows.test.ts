import { describe, expect, it } from "vitest";
import { isZeroRow } from "../grid-classes";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";

const cell = (over: Partial<FlowMatrixCellDto>): FlowMatrixCellDto => ({
  weekStart: "2026-07-20",
  plan: 0,
  committed: null,
  real: null,
  effective: 0,
  layer: "empty",
  ...over,
});

describe("isZeroRow (filtro 'ocultar ceros')", () => {
  it("fila sin ninguna capa en el horizonte → cero", () => {
    expect(isZeroRow({ cells: [cell({}), cell({})] })).toBe(true);
  });

  it("una celda con plan la hace visible", () => {
    expect(
      isZeroRow({ cells: [cell({}), cell({ plan: 100, effective: 100, layer: "plan" })] }),
    ).toBe(false);
  });

  it("una celda comprometida la hace visible", () => {
    expect(
      isZeroRow({
        cells: [cell({ committed: { total: 500, items: [] }, effective: 500, layer: "committed" })],
      }),
    ).toBe(false);
  });

  it("una celda con real la hace visible", () => {
    expect(
      isZeroRow({
        cells: [cell({ real: { total: -200, items: [] }, effective: -200, layer: "real" })],
      }),
    ).toBe(false);
  });

  it("fila vacía (sin celdas) cuenta como cero", () => {
    expect(isZeroRow({ cells: [] })).toBe(true);
  });
});
