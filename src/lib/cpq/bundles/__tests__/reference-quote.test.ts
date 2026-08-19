import { describe, expect, it } from "vitest";
import { referenceQuoteIdFromMembers } from "../reference-quote";

describe("referenceQuoteIdFromMembers", () => {
  it("usa la 1ª incluida por displayOrder", () => {
    expect(
      referenceQuoteIdFromMembers([
        { quoteId: "b", includedInProposal: true, displayOrder: 1 },
        { quoteId: "a", includedInProposal: true, displayOrder: 0 },
        { quoteId: "c", includedInProposal: false, displayOrder: -1 },
      ]),
    ).toBe("a");
  });

  it("ignora hijas fuera del PDF", () => {
    expect(
      referenceQuoteIdFromMembers([
        { quoteId: "out", includedInProposal: false, displayOrder: 0 },
        { quoteId: "in", includedInProposal: true, displayOrder: 5 },
      ]),
    ).toBe("in");
  });

  it("sin incluidas retorna null", () => {
    expect(
      referenceQuoteIdFromMembers([
        { quoteId: "x", includedInProposal: false, displayOrder: 0 },
      ]),
    ).toBeNull();
  });
});
