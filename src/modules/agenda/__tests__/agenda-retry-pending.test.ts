import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_CALENDAR_DISCONNECT_ERROR } from "@/lib/google-workspace/calendar-disconnect";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  syncVisita: vi.fn(),
  syncLic: vi.fn(),
  retryV2: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaEventLink: { findMany: mocks.findMany },
  },
}));

vi.mock("../agenda-sync", () => ({
  syncAgendaVisitaToCalendar: (...args: unknown[]) => mocks.syncVisita(...args),
}));

vi.mock("../agenda-sync-licitacion", () => ({
  syncLicitacionToCalendar: (...args: unknown[]) => mocks.syncLic(...args),
}));

vi.mock("@/modules/calendar/calendar-retry-pending", () => ({
  retryPendingCalendarV2Links: (...args: unknown[]) => mocks.retryV2(...args),
}));

import { retryPendingAgendaLinks } from "../agenda-retry-pending";

describe("retryPendingAgendaLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncVisita.mockResolvedValue({ syncStatus: "SYNCED" });
    mocks.syncLic.mockResolvedValue({ syncStatus: "SYNCED" });
    mocks.retryV2.mockResolvedValue({ retried: 0 });
  });

  it("incluye ERROR por disconnect además de PENDING", async () => {
    mocks.findMany.mockResolvedValue([
      { sourceType: "agenda_visita", sourceId: "v1" },
      { sourceType: "licitacion", sourceId: "d1" },
    ]);

    const res = await retryPendingAgendaLinks({ tenantId: "t1" });

    expect(res.retried).toBe(2);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          OR: [
            { syncStatus: "PENDING" },
            {
              syncStatus: "ERROR",
              lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
            },
          ],
        }),
      }),
    );
    expect(mocks.syncVisita).toHaveBeenCalledWith("t1", "v1");
    expect(mocks.syncLic).toHaveBeenCalledWith("t1", "d1", "upsert", {
      actorUserId: undefined,
    });
  });
});
