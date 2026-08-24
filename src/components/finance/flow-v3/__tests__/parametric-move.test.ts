import { describe, expect, it } from "vitest";
import { isParametricMoveRow, signedParametricPlanAmount } from "../parametric-move";

describe("parametric-move", () => {
  it("reconoce Retiro socios (y alias singular)", () => {
    expect(isParametricMoveRow("Retiro socios")).toBe(true);
    expect(isParametricMoveRow("retiro socio")).toBe(true);
    expect(isParametricMoveRow("CIMS")).toBe(false);
  });

  it("FINANCIAMIENTO firma el plan como egreso", () => {
    expect(signedParametricPlanAmount("FINANCIAMIENTO", 10_000_000)).toBe(-10_000_000);
    expect(signedParametricPlanAmount("GAV", 10_000_000)).toBe(10_000_000);
    expect(signedParametricPlanAmount("FINANCIAMIENTO", 0)).toBe(0);
  });
});
