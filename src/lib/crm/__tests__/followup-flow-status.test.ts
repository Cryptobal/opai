import { describe, expect, it } from "vitest";
import { getFollowUpFlowStatus } from "@/lib/crm/followup-flow-status";

describe("getFollowUpFlowStatus", () => {
  it("Sin iniciar cuando no hay propuesta ni logs", () => {
    const s = getFollowUpFlowStatus({
      proposalSentAt: null,
      proposalLink: null,
      configActive: true,
      totalLogs: 0,
      pendingLogs: 0,
      overdueLogs: 0,
      failedLogs: 0,
    });
    expect(s.label).toBe("Sin iniciar");
  });

  it("Fallido cuando todos los logs fallaron (caso Calama)", () => {
    const s = getFollowUpFlowStatus({
      proposalSentAt: "2026-07-14",
      proposalLink: "https://example.com",
      configActive: true,
      totalLogs: 3,
      pendingLogs: 0,
      overdueLogs: 0,
      failedLogs: 3,
    });
    expect(s.label).toBe("Fallido");
  });

  it("Con fallos si hay mezcla sent/failed sin pendientes", () => {
    const s = getFollowUpFlowStatus({
      proposalSentAt: "2026-07-14",
      proposalLink: null,
      configActive: true,
      totalLogs: 3,
      pendingLogs: 0,
      overdueLogs: 0,
      failedLogs: 1,
    });
    expect(s.label).toBe("Con fallos");
  });

  it("Completado solo si hay logs y ninguno falló ni pendiente", () => {
    const s = getFollowUpFlowStatus({
      proposalSentAt: "2026-07-14",
      proposalLink: null,
      configActive: true,
      totalLogs: 3,
      pendingLogs: 0,
      overdueLogs: 0,
      failedLogs: 0,
    });
    expect(s.label).toBe("Completado");
  });

  it("Activo con pendientes", () => {
    const s = getFollowUpFlowStatus({
      proposalSentAt: "2026-07-14",
      proposalLink: null,
      configActive: true,
      totalLogs: 3,
      pendingLogs: 1,
      overdueLogs: 0,
      failedLogs: 2,
    });
    expect(s.label).toBe("Activo");
  });
});
