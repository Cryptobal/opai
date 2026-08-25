import { describe, expect, it } from "vitest";
import {
  ensureAfcTokenListed,
  patchFiniquitoTemplateContent,
} from "@/lib/docs/patch-finiquito-afc-template";

const sample = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "4. Indemnización sustitutiva" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "TOTAL A PAGAR: " },
        {
          type: "contractToken",
          attrs: { tokenKey: "labor_event.totalSettlementAmount", label: "labor_event.totalSettlementAmount" },
        },
      ],
    },
  ],
};

describe("patchFiniquitoTemplateContent", () => {
  it("inserta AFC antes del total si falta", () => {
    const first = patchFiniquitoTemplateContent(sample);
    expect(first.changed).toBe(true);
    expect(JSON.stringify(first.content)).toContain("labor_event.afcDeductionAmount");
    const second = patchFiniquitoTemplateContent(first.content);
    expect(second.changed).toBe(false);
  });

  it("no toca docs sin total", () => {
    const result = patchFiniquitoTemplateContent({ type: "doc", content: [] });
    expect(result.changed).toBe(false);
  });
});

describe("ensureAfcTokenListed", () => {
  it("agrega el token una sola vez", () => {
    expect(ensureAfcTokenListed(["labor_event.totalSettlementAmount"])).toContain(
      "labor_event.afcDeductionAmount",
    );
    expect(ensureAfcTokenListed(["labor_event.afcDeductionAmount"])).toHaveLength(1);
  });
});
