import { describe, expect, it } from "vitest";
import {
  buildBankTxLinkDisplayFields,
  parseFlowRowNameFromClassifyNote,
  pickBankTxDisplayLink,
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

describe("pickBankTxDisplayLink", () => {
  it("prioriza link con flowRowId aunque sea el segundo cronológicamente", () => {
    const older = {
      flowRowId: null,
      createdAt: new Date("2026-08-01"),
    };
    const newer = {
      flowRowId: "row-devol",
      createdAt: new Date("2026-08-04"),
    };
    expect(pickBankTxDisplayLink([older, newer])).toBe(newer);
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

  it("reproduce bug main post-#1068: flowRowId set + mapa vacío caía en Aporte socios", () => {
    const mainPost1068 = (
      link: { flowRowId: string | null; accountPlanId: string | null },
      map: Map<string, string>,
      legacy: Map<string, string>,
    ) => {
      if (link.flowRowId) {
        const byId = map.get(link.flowRowId);
        if (byId) return byId;
      }
      if (link.accountPlanId) return legacy.get(link.accountPlanId) ?? null;
      return null;
    };

    expect(
      mainPost1068(
        { flowRowId: "row-devol", accountPlanId: "plan-acreedores" },
        new Map(),
        legacyByAccount,
      ),
    ).toBe("Aporte socios");

    expect(
      resolveFlowRowDisplayName(
        { flowRowId: "row-devol", accountPlanId: "plan-acreedores" },
        new Map(),
        legacyByAccount,
      ),
    ).toBeNull();
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
