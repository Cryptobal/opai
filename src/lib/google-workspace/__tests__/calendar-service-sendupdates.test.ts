/**
 * Verifica sendUpdates en events.patch / events.delete (audit B4):
 * reprogramar o cancelar un evento con asistentes debe notificarlos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CalendarEventPayload } from "../calendar-payloads";

const linkFindUnique = vi.fn();
const linkCreate = vi.fn();
const linkUpdate = vi.fn();
const eventsPatch = vi.fn();
const eventsInsert = vi.fn();
const eventsDelete = vi.fn();
const getClientMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaEventLink: {
      findUnique: linkFindUnique,
      create: linkCreate,
      update: linkUpdate,
    },
  },
}));

const getClientForAccountMock = vi.fn();
const resolveCreateTargetMock = vi.fn();

vi.mock("../clients", () => ({
  getCalendarClientForUser: getClientMock,
  getCalendarClientForAccount: getClientForAccountMock,
}));

vi.mock("@/modules/calendar/calendar-sources", () => ({
  resolveCreateTarget: resolveCreateTargetMock,
}));

const BASE_LINK = {
  id: "link-1",
  googleEventId: "gev-1",
  googleCalendarId: "primary",
  htmlLink: "https://cal/x",
};

function payloadWithAttendees(): CalendarEventPayload {
  return {
    summary: "Visita",
    start: { dateTime: "2026-07-22T13:00:00.000Z", timeZone: "America/Santiago" },
    end: { dateTime: "2026-07-22T14:00:00.000Z", timeZone: "America/Santiago" },
    attendees: [{ email: "cliente@ejemplo.cl" }],
    reminders: { useDefault: false, overrides: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  linkFindUnique.mockResolvedValue({ ...BASE_LINK, calendarAccountId: "acc-1" });
  linkUpdate.mockResolvedValue({});
  resolveCreateTargetMock.mockResolvedValue(null);
  eventsPatch.mockResolvedValue({ data: { htmlLink: "https://cal/x" } });
  eventsDelete.mockResolvedValue({});
  const client = {
    calendar: {
      events: {
        patch: eventsPatch,
        update: vi.fn(),
        insert: eventsInsert,
        delete: eventsDelete,
      },
    },
    accountId: "acc-1",
    calendarId: "primary",
    googleEmail: "u@gard.cl",
  };
  getClientMock.mockResolvedValue(client);
  getClientForAccountMock.mockResolvedValue(client);
});

const input = {
  tenantId: "t1",
  sourceType: "agenda_visita" as const,
  sourceId: "v1",
  assignedUserId: "u1",
};

describe("syncEventLink — sendUpdates", () => {
  it("patch con attendees envía sendUpdates:'all'", async () => {
    const { syncEventLink } = await import("../calendar.service");
    await syncEventLink(input, payloadWithAttendees());
    expect(eventsPatch).toHaveBeenCalledTimes(1);
    expect(eventsPatch.mock.calls[0][0]).toMatchObject({ sendUpdates: "all" });
  });

  it("patch sin attendees envía sendUpdates:'none'", async () => {
    const { syncEventLink } = await import("../calendar.service");
    const payload = { ...payloadWithAttendees(), attendees: undefined };
    await syncEventLink(input, payload);
    expect(eventsPatch.mock.calls[0][0]).toMatchObject({ sendUpdates: "none" });
  });

  it("delete envía sendUpdates:'all'", async () => {
    const { syncEventLink } = await import("../calendar.service");
    await syncEventLink(input, null);
    expect(eventsDelete).toHaveBeenCalledTimes(1);
    expect(eventsDelete.mock.calls[0][0]).toMatchObject({ sendUpdates: "all" });
  });
});
