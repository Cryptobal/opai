/**
 * Tests B5 + multicuenta: attendees, attendee_copy, readback RSVP,
 * resolución por vínculo (no por default vigente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const eventFindFirst = vi.fn();
const accountFindMany = vi.fn();
const linkFindUnique = vi.fn();
const linkFindFirst = vi.fn();
const linkUpsert = vi.fn();
const linkUpdate = vi.fn();
const participantUpdate = vi.fn();
const externalUpdate = vi.fn();
const eventsInsert = vi.fn();
const eventsPatch = vi.fn();
const eventsDelete = vi.fn();
const getClientForUserMock = vi.fn();
const getClientForAccountMock = vi.fn();
const resolveCreateTargetMock = vi.fn();

vi.mock("server-only", () => ({}));

const adminFindMany = vi.fn();
const linkUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { findFirst: eventFindFirst },
    googleCalendarAccount: { findMany: accountFindMany },
    admin: { findMany: adminFindMany },
    calendarProviderLink: {
      findUnique: linkFindUnique,
      findFirst: linkFindFirst,
      upsert: linkUpsert,
      update: linkUpdate,
      updateMany: linkUpdateMany,
      findMany: vi.fn().mockResolvedValue([]),
    },
    calendarEventParticipant: { update: participantUpdate },
    calendarExternalAttendee: { update: externalUpdate },
  },
}));

vi.mock("@/lib/google-workspace/clients", () => ({
  getCalendarClientForUser: getClientForUserMock,
  getCalendarClientForAccount: getClientForAccountMock,
  pickDefaultAccount: (
    accounts: Array<{
      userId: string;
      isDefault?: boolean;
      createdAt?: Date;
      sortIndex?: number;
      id: string;
    }>,
    userId: string,
  ) => {
    const mine = accounts.filter((a) => a.userId === userId);
    return (
      mine.find((a) => a.isDefault) ??
      [...mine].sort(
        (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
      )[0]
    );
  },
}));

vi.mock("../calendar-sources", () => ({
  resolveCreateTarget: resolveCreateTargetMock,
}));

const EVENT = {
  id: "ev-1",
  tenantId: "t1",
  title: "Reunión kickoff",
  description: null,
  location: null,
  startAt: new Date("2026-07-22T13:00:00Z"),
  endAt: new Date("2026-07-22T14:00:00Z"),
  allDay: false,
  status: "confirmed",
  deletedAt: null,
  version: 1,
  participants: [
    { id: "p1", userId: "jorge", role: "organizer", responseStatus: "needs_action" },
    { id: "p2", userId: "lizeth", role: "required", responseStatus: "needs_action" },
    { id: "p3", userId: "hugo", role: "required", responseStatus: "needs_action" },
  ],
  externals: [
    { id: "x1", email: "cliente@ejemplo.cl", optional: false, responseStatus: "needs_action" },
  ],
};

function clientFor(accountId: string, calendarId = "primary") {
  return {
    calendar: { events: { insert: eventsInsert, patch: eventsPatch, delete: eventsDelete } },
    accountId,
    calendarId,
    googleEmail: `${accountId}@gard.cl`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  eventFindFirst.mockResolvedValue(EVENT);
  accountFindMany.mockResolvedValue([
    {
      id: "acc-jorge",
      userId: "jorge",
      googleEmail: "jorge@gard.cl",
      isDefault: true,
      createdAt: new Date("2026-01-01"),
      sortIndex: 0,
    },
    {
      id: "acc-lizeth",
      userId: "lizeth",
      googleEmail: "lizeth@gard.cl",
      isDefault: true,
      createdAt: new Date("2026-01-01"),
      sortIndex: 0,
    },
  ]);
  // Hugo sin Google → se invita por Admin.email corporativo.
  adminFindMany.mockResolvedValue([{ id: "hugo", email: "hugo@gard.cl" }]);
  linkFindFirst.mockResolvedValue(null);
  linkFindUnique.mockResolvedValue(null);
  linkUpsert.mockResolvedValue({});
  linkUpdateMany.mockResolvedValue({ count: 0 });
  resolveCreateTargetMock.mockResolvedValue(null);
  eventsInsert.mockResolvedValue({
    data: {
      id: "gev-1",
      htmlLink: "https://cal/x",
      etag: "etag-1",
      attendees: [
        { email: "lizeth@gard.cl", responseStatus: "accepted" },
        { email: "hugo@gard.cl", responseStatus: "needsAction" },
        { email: "cliente@ejemplo.cl", responseStatus: "needsAction" },
      ],
    },
  });
  getClientForUserMock.mockResolvedValue(clientFor("acc-jorge"));
  getClientForAccountMock.mockImplementation((_t: string, accountId: string) =>
    Promise.resolve(clientFor(accountId)),
  );
});

describe("syncCalendarEventToGoogle", () => {
  it("crea evento del organizador con internos (Google o Admin.email) + externos y sendUpdates all", async () => {
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("SYNCED");

    const call = eventsInsert.mock.calls[0][0];
    expect(call.sendUpdates).toBe("all");
    const emails = call.requestBody.attendees.map((a: { email: string }) => a.email);
    expect(emails).toContain("lizeth@gard.cl");
    expect(emails).toContain("hugo@gard.cl");
    expect(emails).toContain("cliente@ejemplo.cl");
    expect(call.requestBody.start.timeZone).toBe("America/Santiago");
    expect(call.requestBody.start.dateTime).toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it("interno sin Google pero con Admin.email NO genera attendee_copy", async () => {
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    await syncCalendarEventToGoogle("t1", "ev-1");
    const copyUpsert = linkUpsert.mock.calls.find(
      (c) => c[0].create?.role === "attendee_copy",
    );
    expect(copyUpsert).toBeFalsy();
    expect(linkUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerAccountId: "user:hugo",
          role: "attendee_copy",
        }),
        data: expect.objectContaining({ syncStatus: "CANCELLED" }),
      }),
    );
  });

  it("interno sin Google ni email corporativo genera link PENDING attendee_copy", async () => {
    adminFindMany.mockResolvedValue([]);
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    await syncCalendarEventToGoogle("t1", "ev-1");
    const copyUpsert = linkUpsert.mock.calls.find(
      (c) => c[0].create?.role === "attendee_copy",
    );
    expect(copyUpsert).toBeTruthy();
    expect(copyUpsert![0].create).toMatchObject({
      providerAccountId: "user:hugo",
      syncStatus: "PENDING",
    });
  });

  it("organizador sin Google deja link organizer PENDING recuperable", async () => {
    getClientForUserMock.mockResolvedValue(null);
    getClientForAccountMock.mockResolvedValue(null);
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("PENDING");
    const pendingUpsert = linkUpsert.mock.calls.find(
      (c) => c[0].create?.role === "organizer" && c[0].create?.syncStatus === "PENDING",
    );
    expect(pendingUpsert).toBeTruthy();
    expect(pendingUpsert![0].create).toMatchObject({
      providerAccountId: "user:jorge",
      lastError: expect.stringMatching(/no tiene Google Calendar/i),
    });
  });

  it("vuelca responseStatus de attendees a participantes y externos", async () => {
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    await syncCalendarEventToGoogle("t1", "ev-1");
    expect(participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p2" },
        data: expect.objectContaining({ responseStatus: "accepted" }),
      }),
    );
    expect(externalUpdate).not.toHaveBeenCalled();
  });

  it("evento cancelado borra con sendUpdates all y marca CANCELLED", async () => {
    eventFindFirst.mockResolvedValue({ ...EVENT, status: "cancelled" });
    linkFindFirst.mockResolvedValue({
      id: "l1",
      providerAccountId: "acc-jorge",
      providerEventId: "gev-1",
      providerCalendarId: "primary",
    });
    eventsDelete.mockResolvedValue({});
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("CANCELLED");
    expect(eventsDelete.mock.calls[0][0]).toMatchObject({ sendUpdates: "all" });
  });

  it("reprogramación: hace patch (no insert) del evento del organizador y marca SYNCED", async () => {
    linkFindFirst.mockResolvedValue({
      id: "l1",
      providerAccountId: "acc-jorge",
      providerEventId: "gev-1",
      providerCalendarId: "primary",
    });
    eventsPatch.mockResolvedValue({
      data: { id: "gev-1", htmlLink: "https://cal/x", etag: "etag-2", attendees: [] },
    });
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("SYNCED");
    expect(eventsPatch).toHaveBeenCalledTimes(1);
    expect(eventsInsert).not.toHaveBeenCalled();
    expect(eventsPatch.mock.calls[0][0]).toMatchObject({
      calendarId: "primary",
      eventId: "gev-1",
    });
    const synced = linkUpsert.mock.calls.find((c) => c[0].update?.syncStatus === "SYNCED");
    expect(synced).toBeTruthy();
  });

  it("fallo de red al reprogramar deja el link PENDING sin revertir (reintentable)", async () => {
    linkFindFirst.mockResolvedValue({
      id: "l1",
      providerAccountId: "acc-jorge",
      providerEventId: "gev-1",
      providerCalendarId: "primary",
    });
    eventsPatch.mockRejectedValue(new Error("socket hang up ECONNRESET"));
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("PENDING");
    expect(linkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1" },
        data: expect.objectContaining({ syncStatus: "PENDING" }),
      }),
    );
  });

  it("evento borrado en Google (404) al reprogramar marca ERROR y no reintenta", async () => {
    linkFindFirst.mockResolvedValue({
      id: "l1",
      providerAccountId: "acc-jorge",
      providerEventId: "gev-1",
      providerCalendarId: "primary",
    });
    eventsPatch.mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("ERROR");
    expect(linkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1" },
        data: expect.objectContaining({ syncStatus: "ERROR" }),
      }),
    );
  });

  it("link existente en cuenta A con default B: actualiza en A y no inserta en B", async () => {
    // Jorge tiene dos cuentas; default es B, link está en A.
    accountFindMany.mockResolvedValue([
      {
        id: "acc-A",
        userId: "jorge",
        googleEmail: "a@gard.cl",
        isDefault: false,
        createdAt: new Date("2026-01-01"),
        sortIndex: 0,
      },
      {
        id: "acc-B",
        userId: "jorge",
        googleEmail: "b@gard.cl",
        isDefault: true,
        createdAt: new Date("2026-02-01"),
        sortIndex: 1,
      },
      {
        id: "acc-lizeth",
        userId: "lizeth",
        googleEmail: "lizeth@gard.cl",
        isDefault: true,
        createdAt: new Date("2026-01-01"),
        sortIndex: 0,
      },
    ]);
    linkFindFirst.mockResolvedValue({
      id: "l1",
      providerAccountId: "acc-A",
      providerEventId: "gev-A",
      providerCalendarId: "primary",
    });
    eventsPatch.mockResolvedValue({
      data: { id: "gev-A", htmlLink: "https://cal/a", etag: "e", attendees: [] },
    });

    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("SYNCED");
    expect(getClientForAccountMock).toHaveBeenCalledWith("t1", "acc-A");
    expect(getClientForUserMock).not.toHaveBeenCalled();
    expect(eventsPatch).toHaveBeenCalledTimes(1);
    expect(eventsInsert).not.toHaveBeenCalled();
    expect(eventsPatch.mock.calls[0][0]).toMatchObject({
      eventId: "gev-A",
      calendarId: "primary",
    });
  });

  it("cuenta del link revocada: marca ERROR y no inserta en otra cuenta", async () => {
    linkFindFirst.mockResolvedValue({
      id: "l1",
      providerAccountId: "acc-revoked",
      providerEventId: "gev-old",
      providerCalendarId: "primary",
    });
    getClientForAccountMock.mockResolvedValue(null);

    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("ERROR");
    expect(eventsInsert).not.toHaveBeenCalled();
    expect(eventsPatch).not.toHaveBeenCalled();
    expect(linkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1" },
        data: expect.objectContaining({
          syncStatus: "ERROR",
          lastError: expect.stringMatching(/no está ACTIVE/i),
        }),
      }),
    );
  });
});

describe("classifyGoogleSyncError", () => {
  it("recurso ausente / sin acceso / request inválido → ERROR (no reintentar)", async () => {
    const { classifyGoogleSyncError } = await import("../calendar-google-sync");
    expect(classifyGoogleSyncError(Object.assign(new Error("x"), { code: 404 }))).toBe("ERROR");
    expect(classifyGoogleSyncError(Object.assign(new Error("x"), { code: 410 }))).toBe("ERROR");
    expect(classifyGoogleSyncError(new Error("Resource has been deleted"))).toBe("ERROR");
    expect(classifyGoogleSyncError(new Error("Not Found"))).toBe("ERROR");
  });

  it("red / rate-limit / 5xx → PENDING (reintentable)", async () => {
    const { classifyGoogleSyncError } = await import("../calendar-google-sync");
    expect(classifyGoogleSyncError(new Error("ECONNRESET socket hang up"))).toBe("PENDING");
    expect(classifyGoogleSyncError(Object.assign(new Error("x"), { code: 429 }))).toBe("PENDING");
    expect(classifyGoogleSyncError(Object.assign(new Error("x"), { code: 503 }))).toBe("PENDING");
    expect(classifyGoogleSyncError(new Error("rateLimitExceeded"))).toBe("PENDING");
  });
});
