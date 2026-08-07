import { describe, expect, it } from "vitest";
import { evaluateCondition } from "/workspace/src/modules/finance/banking/automatch-rule.service";

describe("regla Sistemas · Google", () => {
  it("CONTAINS Google matchea Compra GOOGLE *ADS569701 (case-insensitive)", () => {
    expect(
      evaluateCondition(
        { field: "DESCRIPTION", operator: "CONTAINS", value: "Google" },
        { amount: -300000, description: "Compra GOOGLE *ADS569701", reference: null },
      ),
    ).toBe(true);
  });
});
