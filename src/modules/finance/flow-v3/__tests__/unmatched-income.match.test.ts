import { describe, it, expect } from "vitest";
import { buildIncomeMatcher } from "../row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "../types";

describe("unmatched income matcher (B8)", () => {
  const rows: FlowRowRef[] = [
    {
      id: "r-acc", name: "Cliente A", crmAccountId: "acc-a",
      installationId: null, recurringTemplateId: null, categoryId: null, supplierId: null,
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
});
