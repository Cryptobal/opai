import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agendaUpdateMany: vi.fn(),
  providerUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaEventLink: { updateMany: mocks.agendaUpdateMany },
    calendarProviderLink: { updateMany: mocks.providerUpdateMany },
  },
}));

import {
  GOOGLE_CALENDAR_DISCONNECT_ERROR,
  reactivateDisconnectedCalendarLinks,
} from "../calendar-disconnect";

describe("reactivateDisconnectedCalendarLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agendaUpdateMany.mockResolvedValue({ count: 3 });
    mocks.providerUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("pasa a PENDING solo los links ERROR por disconnect de esa cuenta", async () => {
    const res = await reactivateDisconnectedCalendarLinks("tenant-1", "acct-1");

    expect(res).toEqual({ agendaLinks: 3, providerLinks: 1 });
    expect(mocks.agendaUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        calendarAccountId: "acct-1",
        syncStatus: "ERROR",
        lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
      },
      data: { syncStatus: "PENDING", lastError: null },
    });
    expect(mocks.providerUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        provider: "google",
        providerAccountId: "acct-1",
        syncStatus: "ERROR",
        lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
      },
      data: { syncStatus: "PENDING", lastError: null },
    });
  });
});
