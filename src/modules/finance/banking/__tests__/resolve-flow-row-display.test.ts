import { describe, expect, it } from "vitest";
import {
  buildBankTxLinkDisplayFields,
  parseFlowRowNameFromClassifyNote,
  resolveFlowRowDisplayName,
} from "../resolve-flow-row-display";

describe("parseFlowRowNameFromClassifyNote", () => {
  it("extrae nombre desde nota de classify-suggestions", () => {
    expect(
      parseFlowRowNameFromClassifyNote(
        "Clasificado a fila flujo: Devolución a socios (devolucion-a-socios)",
      ),
    ).toBe("Devolución a socios");
  });

  it("tolera variante sin 'flujo' en el texto", () => {
    expect(
      parseFlowRowNameFromClassifyNote("Clasificado a fila: Aporte socios"),
    ).toBe("Aporte socios");
  });
});

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

  it("flowRowId desconocido NO cae al fallback ambiguo por cuenta", () => {
    expect(
      resolveFlowRowDisplayName(
        { flowRowId: "row-missing", accountPlanId: "plan-acreedores" },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBeNull();
  });

  it("flowRowId desconocido usa nota de clasificación antes que cuenta", () => {
    expect(
      resolveFlowRowDisplayName(
        {
          flowRowId: "row-missing",
          accountPlanId: "plan-acreedores",
          note: "Clasificado a fila flujo: Devolución a socios (devolucion-a-socios)",
        },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBe("Devolución a socios");
  });

  it("link legacy sin flowRowId pero con nota Devolución → Devolución (no Aporte)", () => {
    expect(
      resolveFlowRowDisplayName(
        {
          flowRowId: null,
          accountPlanId: "plan-acreedores",
          note: "Clasificado a fila flujo: Devolución a socios (devolucion-a-socios)",
        },
        flowRowNamesById,
        legacyByAccount,
      ),
    ).toBe("Devolución a socios");
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

describe("buildBankTxLinkDisplayFields — lista Bancos (repro Carlos Irigoyen)", () => {
  const maps = {
    flowRowNamesById: new Map([
      ["row-aporte", "Aporte socios"],
      ["row-devol", "Devolución a socios"],
    ]),
    flowRowNameByAccount: new Map([["plan-acreedores", "Aporte socios"]]),
  };

  const acreedoresAccount = {
    code: "2.1.01.003",
    name: "Acreedores Varios",
  };

  it("flowRowId Devolución + misma cuenta 2.1.01.003 → tooltip Devolución (no Aporte)", () => {
    const { flowRowName, linkAccountLabel } = buildBankTxLinkDisplayFields(
      {
        flowRowId: "row-devol",
        accountPlanId: "plan-acreedores",
        note: "Clasificado a fila flujo: Devolución a socios (devolucion-a-socios)",
        accountPlan: acreedoresAccount,
      },
      maps,
    );

    expect(flowRowName).toBe("Devolución a socios");
    expect(flowRowName).not.toBe("Aporte socios");
    expect(linkAccountLabel).toBe("2.1.01.003 · Acreedores Varios");

    const tooltip = [flowRowName, linkAccountLabel].filter(Boolean).join(" · ");
    expect(tooltip).toContain("Devolución a socios");
    expect(tooltip).not.toMatch(/^Aporte socios/);
  });

  it("link legacy sin flowRowId pero nota Devolución → lista alineada al drawer", () => {
    const { flowRowName } = buildBankTxLinkDisplayFields(
      {
        flowRowId: null,
        accountPlanId: "plan-acreedores",
        note: "Clasificado a fila flujo: Devolución a socios (devolucion-a-socios)",
        accountPlan: acreedoresAccount,
      },
      maps,
    );

    expect(flowRowName).toBe("Devolución a socios");
  });
});
