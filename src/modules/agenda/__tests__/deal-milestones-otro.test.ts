import { beforeEach, describe, expect, it, vi } from "vitest";

const createOpai = vi.fn();

vi.mock("@/modules/calendar/calendar-write", () => ({
  createOpaiEvent: (...a: unknown[]) => createOpai(...a),
}));

import { createDealMilestoneEvent } from "../deal-milestones";

beforeEach(() => {
  vi.clearAllMocks();
  createOpai.mockResolvedValue({
    eventId: "ev-1",
    syncStatus: "SYNCED",
    htmlLink: null,
    visita: {
      id: "ev-1",
      title: "Reunión kickoff",
      type: "otra",
      label: "Reunión",
      assignedUserId: "u1",
      dealId: "d1",
      status: "programada",
    },
  });
});

describe("createDealMilestoneEvent — kind otro", () => {
  it("crea evento en negocio no licitación con label libre", async () => {
    const res = await createDealMilestoneEvent({
      tenantId: "t1",
      actorUserId: "u1",
      dealId: "d1",
      accountId: "a1",
      kind: "otro",
      title: "Reunión kickoff",
      label: "Reunión",
      startAt: new Date("2026-08-10T13:00:00Z"),
      endAt: new Date("2026-08-10T14:00:00Z"),
    });
    expect(res.title).toBe("Reunión kickoff");
    expect(createOpai).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: "d1",
        title: "Reunión kickoff",
        label: "Reunión",
        notes: null,
      }),
    );
  });
});
