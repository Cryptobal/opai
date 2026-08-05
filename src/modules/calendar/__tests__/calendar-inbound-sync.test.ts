import { describe, it, expect, vi, beforeEach } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { CHILE_TZ, ymdInChile } from "@/lib/dates-cl";

const cursorFindFirst = vi.fn();
const accountFindFirst = vi.fn();
const accountUpdate = vi.fn();
const linkFindFirst = vi.fn();
const linkUpdate = vi.fn();
const eventFindFirst = vi.fn();
const eventUpdate = vi.fn();
const visitaUpdateMany = vi.fn();
const legacyFindFirst = vi.fn();
const legacyUpdate = vi.fn();
const cursorUpsert = vi.fn();
const cursorUpdateMany = vi.fn();
const auditCreate = vi.fn();
const adminFindMany = vi.fn();
const gcalFindMany = vi.fn();
const participantUpdate = vi.fn();
const externalUpdate = vi.fn();
const eventsList = vi.fn();
const getClientMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarSyncCursor: {
      findFirst: (...a: unknown[]) => cursorFindFirst(...a),
      upsert: (...a: unknown[]) => cursorUpsert(...a),
      updateMany: (...a: unknown[]) => cursorUpdateMany(...a),
    },
    googleCalendarAccount: {
      findFirst: (...a: unknown[]) => accountFindFirst(...a),
      update: (...a: unknown[]) => accountUpdate(...a),
      findMany: (...a: unknown[]) => gcalFindMany(...a),
    },
    calendarProviderLink: {
      findFirst: (...a: unknown[]) => linkFindFirst(...a),
      update: (...a: unknown[]) => linkUpdate(...a),
    },
    calendarEvent: {
      findFirst: (...a: unknown[]) => eventFindFirst(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
    agendaVisita: { updateMany: (...a: unknown[]) => visitaUpdateMany(...a) },
    agendaEventLink: {
      findFirst: (...a: unknown[]) => legacyFindFirst(...a),
      update: (...a: unknown[]) => legacyUpdate(...a),
    },
    calendarAuditEvent: { create: (...a: unknown[]) => auditCreate(...a) },
    admin: { findMany: (...a: unknown[]) => adminFindMany(...a) },
    calendarEventParticipant: { update: (...a: unknown[]) => participantUpdate(...a) },
    calendarExternalAttendee: { update: (...a: unknown[]) => externalUpdate(...a) },
  },
}));

vi.mock("@/lib/google-workspace/clients", () => ({
  getCalendarClientForAccount: (...a: unknown[]) => getClientMock(...a),
}));

vi.mock("../calendar-audit", () => ({
  recordCalendarAudit: (...a: unknown[]) => auditCreate(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CALENDAR_INBOUND_SYNC_ENABLED = "true";
  gcalFindMany.mockResolvedValue([]);
  adminFindMany.mockResolvedValue([]);
  auditCreate.mockResolvedValue({});
  cursorUpsert.mockResolvedValue({});
  accountUpdate.mockResolvedValue({});
  linkUpdate.mockResolvedValue({});
  eventUpdate.mockResolvedValue({});
  visitaUpdateMany.mockResolvedValue({ count: 1 });
});

describe("googleEventBoundsToDates", () => {
  it("all-day usa medianoche Chile (no UTC) y end exclusivo −1 día", async () => {
    const { googleEventBoundsToDates } = await import("../calendar-inbound-sync");
    const bounds = googleEventBoundsToDates({
      start: { date: "2026-08-10" },
      end: { date: "2026-08-11" },
    });
    expect(bounds?.allDay).toBe(true);
    expect(ymdInChile(bounds!.startAt)).toBe("2026-08-10");
    expect(ymdInChile(bounds!.endAt)).toBe("2026-08-10");
    // No debe ser medianoche UTC (que en Chile sería el día anterior).
    const utcMidnight = new Date("2026-08-10T00:00:00.000Z");
    expect(bounds!.startAt.getTime()).not.toBe(utcMidnight.getTime());
    const chileMidnight = fromZonedTime(new Date(2026, 7, 10, 0, 0, 0, 0), CHILE_TZ);
    expect(bounds!.startAt.getTime()).toBe(chileMidnight.getTime());
  });
});

describe("processGoogleCalendarInbound", () => {
  it("match v2 por providerEventId y actualiza CalendarEvent + AgendaVisita", async () => {
    getClientMock.mockResolvedValue({
      calendar: { events: { list: eventsList } },
      accountId: "acc-1",
      calendarId: "primary",
    });
    eventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "gev-1",
            etag: "etag-new",
            summary: "Reunión movida",
            location: "Oficina",
            start: { dateTime: "2026-08-10T15:00:00-04:00" },
            end: { dateTime: "2026-08-10T16:00:00-04:00" },
            attendees: [{ email: "hugo@gard.cl", responseStatus: "accepted" }],
          },
        ],
        nextSyncToken: "sync-token-1",
      },
    });
    linkFindFirst.mockResolvedValue({
      id: "pl-1",
      eventId: "ev-1",
      etag: "etag-old",
      localVersion: 0,
      role: "organizer",
    });
    eventFindFirst
      .mockResolvedValueOnce({
        id: "ev-1",
        tenantId: "t1",
        title: "Viejo",
        description: null,
        location: null,
        version: 1,
        participants: [
          { id: "p1", userId: "hugo", responseStatus: "needs_action" },
        ],
        externals: [],
      })
      .mockResolvedValueOnce({
        id: "ev-1",
        tenantId: "t1",
        title: "Reunión movida",
        version: 2,
        participants: [
          { id: "p1", userId: "hugo", responseStatus: "needs_action" },
        ],
        externals: [],
      });
    adminFindMany.mockResolvedValue([{ id: "hugo", email: "hugo@gard.cl" }]);

    const { processGoogleCalendarInbound } = await import("../calendar-inbound-sync");
    const res = await processGoogleCalendarInbound({
      tenantId: "t1",
      accountId: "acc-1",
      calendarId: "primary",
      prefs: {},
      syncToken: "old-token",
    });

    expect(res.ok).toBe(true);
    expect(res.processed).toBe(1);
    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ev-1" },
        data: expect.objectContaining({
          title: "Reunión movida",
          location: "Oficina",
        }),
      }),
    );
    expect(visitaUpdateMany).toHaveBeenCalled();
    expect(participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responseStatus: "accepted" }),
      }),
    );
    expect(cursorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ syncToken: "sync-token-1" }),
      }),
    );
  });

  it("410 fullSyncRequired limpia syncToken y relanza pasada acotada", async () => {
    getClientMock.mockResolvedValue({
      calendar: { events: { list: eventsList } },
      accountId: "acc-1",
      calendarId: "primary",
    });
    eventsList
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { code: 410 }))
      .mockResolvedValueOnce({
        data: { items: [], nextSyncToken: "fresh-token" },
      });
    cursorUpdateMany.mockResolvedValue({ count: 1 });

    const { processGoogleCalendarInbound } = await import("../calendar-inbound-sync");
    const res = await processGoogleCalendarInbound({
      tenantId: "t1",
      accountId: "acc-1",
      calendarId: "primary",
      prefs: { syncToken: "stale" },
      syncToken: "stale",
    });

    expect(res.ok).toBe(true);
    expect(cursorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { syncToken: null } }),
    );
    expect(eventsList).toHaveBeenCalledTimes(2);
    // Segunda llamada sin syncToken, con ventana timeMin/timeMax.
    expect(eventsList.mock.calls[1][0].syncToken).toBeUndefined();
    expect(eventsList.mock.calls[1][0].timeMin).toBeTruthy();
    expect(cursorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ syncToken: "fresh-token" }),
      }),
    );
  });

  it("paginación: persiste nextSyncToken solo de la última página", async () => {
    getClientMock.mockResolvedValue({
      calendar: { events: { list: eventsList } },
      accountId: "acc-1",
      calendarId: "primary",
    });
    eventsList
      .mockResolvedValueOnce({
        data: {
          items: [{ id: "e1", status: "cancelled" }],
          nextPageToken: "page-2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ id: "e2", status: "cancelled" }],
          nextSyncToken: "final-token",
        },
      });
    linkFindFirst.mockResolvedValue(null);
    legacyFindFirst.mockResolvedValue(null);

    const { processGoogleCalendarInbound } = await import("../calendar-inbound-sync");
    await processGoogleCalendarInbound({
      tenantId: "t1",
      accountId: "acc-1",
      calendarId: "primary",
      prefs: {},
      syncToken: null,
    });

    expect(eventsList).toHaveBeenCalledTimes(2);
    expect(cursorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ syncToken: "final-token" }),
      }),
    );
  });
});

describe("resolveAccountForChannel", () => {
  it("resuelve por cursor y rechaza accountId del token distinto", async () => {
    cursorFindFirst.mockResolvedValue({
      providerAccountId: "acc-real",
      tenantId: "t1",
      providerCalendarId: "primary",
      syncToken: "tok",
    });
    const { resolveAccountForChannel } = await import("../calendar-inbound-sync");
    const bad = await resolveAccountForChannel({
      channelId: "ch-1",
      tokenAccountId: "acc-other",
      tokenTenantId: "t1",
    });
    expect(bad).toBeNull();

    accountFindFirst.mockResolvedValue({
      id: "acc-real",
      tenantId: "t1",
      calendarId: "primary",
      prefs: { channelId: "ch-1" },
    });
    const ok = await resolveAccountForChannel({
      channelId: "ch-1",
      tokenAccountId: "acc-real",
      tokenTenantId: "t1",
    });
    expect(ok?.accountId).toBe("acc-real");
    expect(ok?.syncToken).toBe("tok");
  });
});
