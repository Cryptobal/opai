import { describe, it, expect } from "vitest";
import { buildIncomeMatcher } from "../row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "../types";

describe("unmatched income matcher (B8)", () => {
  const rows: FlowRowRef[] = [
    {
      id: "r-acc", name: "Cliente A", crmAccountId: "acc-a",
      installationId: null, recurringTemplateId: null, categoryId: null, supplierId: null,
      mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
    },
  ];
  const match = buildIncomeMatcher(rows);

  it("cuenta con fila genérica no es unmatched", () => {
    expect(match("acc-a", null, null)).toBe("r-acc");
  });

  it("cuenta sin fila → UNMATCHED_INCOME_KEY", () => {
    expect(match("acc-z", null, null)).toBe(UNMATCHED_INCOME_KEY);
  });

  it("sin cuenta → unmatched", () => {
    expect(match(null, null, null)).toBe(UNMATCHED_INCOME_KEY);
  });

  it("v4.2: cuenta con sola fila de template no es unmatched", () => {
    const m = buildIncomeMatcher([
      {
        id: "r-tpl", name: "Cliente T", crmAccountId: "acc-t",
        installationId: "i1", recurringTemplateId: "tpl-1", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ]);
    expect(m("acc-t", null, null)).toBe("r-tpl");
  });
});
