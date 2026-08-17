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

  it("licitación: exige contenido completo, no aprobación manual de secciones", () => {
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

  it("licitación: no habilita si falta negocio, cuenta, líneas o ya está enviada", () => {
    const base = {
      contentComplete: true,
      quoteStatus: "draft",
      hasLineItems: true,
      hasAccount: true,
      hasDeal: true,
    };
    expect(isLicitacionMarkSentEnabled({ ...base, quoteStatus: "sent" })).toBe(false);
    expect(isLicitacionMarkSentEnabled({ ...base, hasDeal: false })).toBe(false);
    expect(isLicitacionMarkSentEnabled({ ...base, hasAccount: false })).toBe(false);
    expect(isLicitacionMarkSentEnabled({ ...base, hasLineItems: false })).toBe(false);
  });
});
