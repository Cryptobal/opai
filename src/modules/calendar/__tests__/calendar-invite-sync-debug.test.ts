import { describe, it, expect } from "vitest";
import {
  buildInviteSyncDebugPayload,
  emailDomainForAudit,
  hashEmailForAudit,
} from "../calendar-invite-sync-debug";

describe("calendar-invite-sync-debug", () => {
  it("hashea y trunca correo; nunca lo deja en claro", () => {
    const h = hashEmailForAudit("Rafael@Gard.cl");
    expect(h).toHaveLength(12);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(h).not.toContain("rafael");
    expect(emailDomainForAudit("Rafael@Gard.cl")).toBe("gard.cl");
  });

  it("arma payload con conteos y dominios ordenados", () => {
    const payload = buildInviteSyncDebugPayload({
      eventId: "ev-1",
      participantsCount: 3,
      internalIdsCount: 2,
      internalIdsResolvedCount: 1,
      attendeeEmails: ["b@ejemplo.cl", "a@gard.cl", "a@gard.cl"],
      externalEmailsCount: 1,
      sendUpdates: "all",
      googleEventId: "gev-9",
      googleStatus: "confirmed",
      googleAttendeesReturned: 0,
    });
    expect(payload.attendeeEmailsCount).toBe(2);
    expect(payload.attendeeDomains).toEqual(["ejemplo.cl", "gard.cl"]);
    expect(payload.googleAttendeesReturned).toBe(0);
    expect(payload.internalIdsResolvedCount).toBe(1);
    expect(JSON.stringify(payload)).not.toMatch(/@gard\.cl|@ejemplo\.cl/);
  });
});
