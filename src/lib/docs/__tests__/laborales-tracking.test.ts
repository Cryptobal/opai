import { describe, expect, it } from "vitest";
import {
  recipientProgressKind,
  readCampaignKpis,
  sumCampaignKpis,
} from "../laborales/tracking-progress";

describe("recipientProgressKind", () => {
  const signers = [
    { status: "signed", signingOrder: 1 },
    { status: "pending", signingOrder: 2 },
    { status: "pending", signingOrder: 3 },
  ];

  it("marca el turno actual y deja el resto en espera en modo secuencial", () => {
    expect(recipientProgressKind(signers[0], signers, true)).toBe("signed");
    expect(recipientProgressKind(signers[1], signers, true)).toBe("pending");
    expect(recipientProgressKind(signers[2], signers, true)).toBe("waiting");
  });

  it("en paralelo todos los no firmados están pendientes", () => {
    expect(recipientProgressKind(signers[1], signers, false)).toBe("pending");
    expect(recipientProgressKind(signers[2], signers, false)).toBe("pending");
  });

  it("refleja rechazo con motivo aparte del estado", () => {
    const declined = { status: "declined", signingOrder: 2 };
    expect(recipientProgressKind(declined, [signers[0], declined], true)).toBe("declined");
  });
});

describe("KPIs de campaña", () => {
  it("suma pendientes en processing", () => {
    expect(readCampaignKpis({ sent: 4, pending: 1, processing: 2, skipped: 3, error: 1 })).toEqual({
      sent: 4,
      skipped: 3,
      error: 1,
      pending: 3,
    });
  });

  it("agrega totales de varias campañas", () => {
    const sum = sumCampaignKpis([
      { totals: { sent: 1, skipped: 1 } },
      { totals: { sent: 2, error: 1, pending: 4 } },
    ]);
    expect(sum).toEqual({ sent: 3, skipped: 1, error: 1, pending: 4 });
  });
});
