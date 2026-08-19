import { describe, expect, it } from "vitest";
import { isProposalSectionsReadOnly } from "../editor-lock";

describe("isProposalSectionsReadOnly", () => {
  it("no aplica el lock de costeo enviado a la propuesta", () => {
    expect(isProposalSectionsReadOnly(true)).toBe(false);
    expect(isProposalSectionsReadOnly(false)).toBe(false);
  });
});
