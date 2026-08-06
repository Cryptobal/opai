import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLink: vi.fn(),
  updateLink: vi.fn(),
  findDeal: vi.fn(),
  syncEventLink: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaEventLink: {
      findFirst: (...args: unknown[]) => mocks.findLink(...args),
      update: (...args: unknown[]) => mocks.updateLink(...args),
    },
    crmDeal: {
      findFirst: (...args: unknown[]) => mocks.findDeal(...args),
    },
  },
}));

vi.mock("@/lib/google-workspace", () => ({
  syncEventLink: (...args: unknown[]) => mocks.syncEventLink(...args),
}));

import { syncLicitacionToCalendar } from "../agenda-sync-licitacion";

describe("syncLicitacionToCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si no hay vínculo legacy", async () => {
    mocks.findLink.mockResolvedValue(null);
    const res = await syncLicitacionToCalendar("t1", "d1", "upsert");
    expect(res.syncStatus).toBe("CANCELLED");
    expect(mocks.syncEventLink).not.toHaveBeenCalled();
  });

  it("marca CANCELLED local si hay vínculo sin evento Google", async () => {
    mocks.findLink.mockResolvedValue({
      id: "l1",
      googleEventId: null,
      calendarAccountId: null,
    });
    mocks.updateLink.mockResolvedValue({});
    const res = await syncLicitacionToCalendar("t1", "d1");
    expect(res.syncStatus).toBe("CANCELLED");
    expect(mocks.updateLink).toHaveBeenCalled();
    expect(mocks.syncEventLink).not.toHaveBeenCalled();
  });

  it("borra el evento Google aunque el caller pida upsert", async () => {
    mocks.findLink.mockResolvedValue({
      id: "l1",
      googleEventId: "g1",
      calendarAccountId: "acc1",
    });
    mocks.findDeal.mockResolvedValue({
      account: { ownerId: "u1" },
    });
    mocks.syncEventLink.mockResolvedValue({ syncStatus: "CANCELLED" });

    const res = await syncLicitacionToCalendar("t1", "d1", "upsert", {
      actorUserId: "u2",
    });

    expect(res.syncStatus).toBe("CANCELLED");
    expect(mocks.syncEventLink).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        sourceType: "licitacion",
        sourceId: "d1",
        assignedUserId: "u1",
      }),
      null,
    );
  });
});
