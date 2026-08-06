import { describe, it, expect } from "vitest";
import { buildExpenseIndexes, matchExpenseRow } from "../row-match";
import { UNMATCHED_EXPENSE_KEY, type FlowRowRef } from "../types";

describe("matchExpenseRow — precedencia y destino por defecto", () => {
  const rows: FlowRowRef[] = [
    {
      id: "r-sup", name: "Proveedor", crmAccountId: null, installationId: null,
      categoryId: null, supplierId: "sup-1", mapping: "SUPPLIER",
    },
    {
      id: "r-sueldo", name: "Sueldos", crmAccountId: null, installationId: null,
      categoryId: null, canonicalKey: "SUELDO", accountPlanIds: ["acc-rem"],
      mapping: "ACCOUNTS",
    },
    {
      id: "r-quincena", name: "Quincena", crmAccountId: null, installationId: null,
      categoryId: null, canonicalKey: "QUINCENA", accountPlanIds: ["acc-rem"],
      mapping: "ACCOUNTS",
    },
    {
      id: "r-te", name: "TE", crmAccountId: null, installationId: null,
      categoryId: null, canonicalKey: "TURNO_EXTRA", accountPlanIds: ["acc-rem"],
      mapping: "ACCOUNTS",
    },
    {
      id: "r-fin", name: "Finiquitos", crmAccountId: null, installationId: null,
      categoryId: null, canonicalKey: "FINIQUITO", accountPlanIds: ["acc-rem"],
      mapping: "ACCOUNTS",
    },
    {
      id: "r-arr", name: "Arriendo", crmAccountId: null, installationId: null,
      categoryId: null, accountPlanIds: ["acc-arr"], mapping: "ACCOUNTS",
    },
  ];

  it("supplier gana sobre canonicalKey y cuenta", () => {
    const idx = buildExpenseIndexes(
      rows,
      new Map([["acc-rem", "r-sueldo"], ["acc-arr", "r-arr"]]),
    );
    expect(
      matchExpenseRow(idx, {
        supplierId: "sup-1",
        canonicalKey: "SUELDO",
        accountPlanId: "acc-arr",
      }),
    ).toBe("r-sup");
  });

  it("canonicalKey gana sobre cuenta compartida", () => {
    const idx = buildExpenseIndexes(
      rows,
      new Map([["acc-rem", "r-sueldo"]]),
    );
    expect(
      matchExpenseRow(idx, { canonicalKey: "QUINCENA", accountPlanId: "acc-rem" }),
    ).toBe("r-quincena");
    expect(
      matchExpenseRow(idx, { canonicalKey: "TURNO_EXTRA", accountPlanId: "acc-rem" }),
    ).toBe("r-te");
  });

  it("cuenta compartida por 4 renglones rutea al isDefaultTarget", () => {
    const idx = buildExpenseIndexes(
      rows,
      new Map([["acc-rem", "r-sueldo"]]),
    );
    expect(matchExpenseRow(idx, { accountPlanId: "acc-rem" })).toBe("r-sueldo");
  });

  it("sin match → bandeja", () => {
    const idx = buildExpenseIndexes(rows, new Map());
    expect(matchExpenseRow(idx, { accountPlanId: "acc-x" })).toBe(
      UNMATCHED_EXPENSE_KEY,
    );
  });
});
