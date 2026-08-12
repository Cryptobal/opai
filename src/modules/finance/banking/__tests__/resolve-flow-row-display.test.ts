import { describe, expect, it } from "vitest";
import { resolveFlowRowDisplayName } from "../resolve-flow-row-display";

describe("resolveFlowRowDisplayName", () => {
  const flowRowNamesById = new Map([
    ["row-aporte", "Aporte socios"],
    ["row-devol", "Devolución a socios"],
    ["row-finiquito", "Finiquitos"],
  ]);

  const legacyByAccount = new Map([
    ["plan-acreedores", "Aporte socios"],
    ["plan-sueldos", "Finiquitos"],
  ]);

  it("prioriza flowRowId cuando varias filas comparten cuenta (Acreedores Varios)", () => {
    expect(
      resolveFlowRowDisplayName(
        { flowRowId: "row-devol", accountPlanId: "plan-acreedores" },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBe("Devolución a socios");
  });

  it("sin flowRowId usa fallback legacy por accountPlanId", () => {
    expect(
      resolveFlowRowDisplayName(
        { flowRowId: null, accountPlanId: "plan-acreedores" },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBe("Aporte socios");
  });

  it("flowRowId desconocido cae al fallback por cuenta", () => {
    expect(
      resolveFlowRowDisplayName(
        { flowRowId: "row-missing", accountPlanId: "plan-sueldos" },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBe("Finiquitos");
  });

  it("sin link contable ni fila → null", () => {
    expect(
      resolveFlowRowDisplayName(
        { flowRowId: null, accountPlanId: null },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBeNull();
  });
});
