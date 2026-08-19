import { describe, expect, it } from "vitest";
import { referenceQuoteIdFromMembers } from "@/lib/cpq/bundles/reference-quote";
import { isProposalSectionsReadOnly } from "@/lib/cpq/proposal-sections/editor-lock";

describe("editor consolidado", () => {
  it("usa quoteId de la 1ª incluida", () => {
    const quoteId = referenceQuoteIdFromMembers([
      { quoteId: "charrua", includedInProposal: true, displayOrder: 0 },
      { quoteId: "ancoa", includedInProposal: true, displayOrder: 1 },
    ]);
    expect(quoteId).toBe("charrua");
  });

  it("readOnly de costeo enviado no se aplica al editor", () => {
    expect(isProposalSectionsReadOnly(true)).toBe(false);
  });
});
