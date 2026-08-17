import { describe, expect, it } from "vitest";
import {
  isCommercialSendEnabled,
  isLicitacionMarkSentEnabled,
} from "../send-gates";

describe("send gates", () => {
  it("comercial: no exige propuesta aprobada, solo contenido listo", () => {
    expect(
      isCommercialSendEnabled({
        proposalReady: true,
        hasLineItems: true,
        hasAccount: true,
        hasContact: true,
        hasDeal: true,
        quoteExists: true,
      }),
    ).toBe(true);

    expect(
      isCommercialSendEnabled({
        proposalReady: false,
        hasLineItems: true,
        hasAccount: true,
        hasContact: true,
        hasDeal: true,
        quoteExists: true,
      }),
    ).toBe(false);
  });

  it("licitación: exige contenido completo (no aprobación manual)", () => {
    expect(
      isLicitacionMarkSentEnabled({
        contentComplete: false,
        quoteStatus: "draft",
        hasLineItems: true,
        hasAccount: true,
        hasDeal: true,
      }),
    ).toBe(false);

    expect(
      isLicitacionMarkSentEnabled({
        contentComplete: true,
        quoteStatus: "draft",
        hasLineItems: true,
        hasAccount: true,
        hasDeal: true,
      }),
    ).toBe(true);
  });
});
