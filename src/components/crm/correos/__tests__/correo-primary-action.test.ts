import { describe, expect, it } from "vitest";
import { resolveCorreoPrimaryAction } from "../correo-primary-action";

describe("resolveCorreoPrimaryAction", () => {
  it("sin destinatario ni replyAll → Reenviar (hilo no-reply / solo enviados)", () => {
    const a = resolveCorreoPrimaryAction({ to: [], replyAll: null });
    expect(a.mode).toBe("forward");
    expect(a.label).toBe("Reenviar");
    expect(a.canReply).toBe(false);
    expect(a.replyAllAvailable).toBe(false);
  });

  it("con destinatario de respuesta → Responder", () => {
    const a = resolveCorreoPrimaryAction({ to: ["a@example.com"], replyAll: null });
    expect(a.mode).toBe("reply");
    expect(a.label).toBe("Responder");
    expect(a.canReply).toBe(true);
  });

  it("replyAll sin CC ni destinatarios extra → sin 'A todos'", () => {
    const a = resolveCorreoPrimaryAction({
      to: ["a@example.com"],
      replyAll: { to: ["a@example.com"], cc: [] },
    });
    expect(a.canReply).toBe(true);
    expect(a.replyAllAvailable).toBe(false);
  });

  it("replyAll con CC → 'A todos' disponible", () => {
    const a = resolveCorreoPrimaryAction({
      to: ["a@example.com"],
      replyAll: { to: ["a@example.com"], cc: ["c@example.com"] },
    });
    expect(a.replyAllAvailable).toBe(true);
  });

  it("replyAll con destinatarios extra sobre `to` → 'A todos' disponible", () => {
    const a = resolveCorreoPrimaryAction({
      to: ["a@example.com"],
      replyAll: { to: ["a@example.com", "b@example.com"], cc: [] },
    });
    expect(a.replyAllAvailable).toBe(true);
  });

  it("solo replyAll (to vacío) todavía permite responder", () => {
    const a = resolveCorreoPrimaryAction({
      to: [],
      replyAll: { to: ["a@example.com"], cc: [] },
    });
    expect(a.canReply).toBe(true);
    expect(a.mode).toBe("reply");
    // to.length (0) !== replyAll.to.length (1) → hay destinatario extra.
    expect(a.replyAllAvailable).toBe(true);
  });
});
