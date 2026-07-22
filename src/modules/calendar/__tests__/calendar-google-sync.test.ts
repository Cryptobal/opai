/**
 * Tests B5: attendees internos+externos en el evento del organizador,
 * fallback attendee_copy para internos sin Google, y readback de RSVP.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const eventFindFirst = vi.fn();
const accountFindMany = vi.fn();
const linkFindUnique = vi.fn();
const linkUpsert = vi.fn();
const linkUpdate = vi.fn();
const participantUpdate = vi.fn();
const externalUpdate = vi.fn();
const eventsInsert = vi.fn();
const eventsPatch = vi.fn();
const eventsDelete = vi.fn();
const getClientMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { findFirst: eventFindFirst },
    googleCalendarAccount: { findMany: accountFindMany },
    calendarProviderLink: {
      findUnique: linkFindUnique,
      upsert: linkUpsert,
      update: linkUpdate,
      findMany: vi.fn().mockResolvedValue([]),
    },
    calendarEventParticipant: { update: participantUpdate },
    calendarExternalAttendee: { update: externalUpdate },
  },
}));

vi.mock("@/lib/google-workspace/clients", () => ({
  getCalendarClientForUser: getClientMock,
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

beforeEach(() => {
  vi.clearAllMocks();
  eventFindFirst.mockResolvedValue(EVENT);
  // Jorge (organizador) y Lizeth tienen Google; Hugo no.
  accountFindMany.mockResolvedValue([
    { id: "acc-jorge", userId: "jorge", googleEmail: "jorge@gard.cl" },
    { id: "acc-lizeth", userId: "lizeth", googleEmail: "lizeth@gard.cl" },
  ]);
  linkFindUnique.mockResolvedValue(null);
  linkUpsert.mockResolvedValue({});
  eventsInsert.mockResolvedValue({
    data: {
      id: "gev-1",
      htmlLink: "https://cal/x",
      etag: "etag-1",
      attendees: [
        { email: "lizeth@gard.cl", responseStatus: "accepted" },
        { email: "cliente@ejemplo.cl", responseStatus: "needsAction" },
      ],
    },
  });
  getClientMock.mockResolvedValue({
    calendar: { events: { insert: eventsInsert, patch: eventsPatch, delete: eventsDelete } },
    accountId: "acc-jorge",
    calendarId: "primary",
  });
});

describe("syncCalendarEventToGoogle", () => {
  it("crea evento del organizador con internos-con-Google + externos y sendUpdates all", async () => {
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("SYNCED");

    const call = eventsInsert.mock.calls[0][0];
    expect(call.sendUpdates).toBe("all");
    const emails = call.requestBody.attendees.map((a: { email: string }) => a.email);
    expect(emails).toContain("lizeth@gard.cl");
    expect(emails).toContain("cliente@ejemplo.cl");
    expect(emails).not.toContain("hugo"); // sin cuenta: no va como attendee
    expect(call.requestBody.start.timeZone).toBe("America/Santiago");
  });

  it("interno sin Google genera link PENDING attendee_copy", async () => {
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

  it("vuelca responseStatus de attendees a participantes y externos", async () => {
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    await syncCalendarEventToGoogle("t1", "ev-1");
    expect(participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p2" },
        data: expect.objectContaining({ responseStatus: "accepted" }),
      }),
    );
    // Externo quedó needs_action (ya era el valor) → sin update redundante.
    expect(externalUpdate).not.toHaveBeenCalled();
  });

  it("evento cancelado borra con sendUpdates all y marca CANCELLED", async () => {
    eventFindFirst.mockResolvedValue({ ...EVENT, status: "cancelled" });
    linkFindUnique.mockResolvedValue({
      id: "l1",
      providerEventId: "gev-1",
      providerCalendarId: "primary",
    });
    eventsDelete.mockResolvedValue({});
    const { syncCalendarEventToGoogle } = await import("../calendar-google-sync");
    const res = await syncCalendarEventToGoogle("t1", "ev-1");
    expect(res.syncStatus).toBe("CANCELLED");
    expect(eventsDelete.mock.calls[0][0]).toMatchObject({ sendUpdates: "all" });
  });
});
