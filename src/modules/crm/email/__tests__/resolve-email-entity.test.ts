import { describe, expect, it } from "vitest";
import { buildSearchPlanFromEntities } from "../resolve-email-entity";

describe("buildSearchPlanFromEntities", () => {
  it("prioriza to/domain y deja ACUDA como término libre", () => {
    const plan = buildSearchPlanFromEntities({
      freeText: ["cotización", "ACUDA", "Luis", "González", "Macronet"],
      entities: [
        {
          kind: "person",
          label: "Luis González",
          emails: ["lgonzalez@macronet.cl"],
          domains: ["macronet.cl"],
          score: 20,
        },
      ],
    });
    expect(plan.to).toEqual(["lgonzalez@macronet.cl"]);
    expect(plan.domain).toEqual(["macronet.cl"]);
    expect(plan.queryTerms).toEqual(
      expect.arrayContaining(["cotización", "ACUDA"]),
    );
    expect(plan.queryTerms.join(" ").toLowerCase()).not.toContain("luis");
    expect(plan.folder).toBe("all");
  });
});
