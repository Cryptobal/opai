/**
 * Tests unitarios Calendar v2 (prisma mockeado):
 * - createCalendarEvent: creador organizer/owner según participantes.
 * - reprogramAgendaVisita con CALENDAR_V2: reasignar NO borra el evento Google
 *   del organizador (sin delete, sin limpiar link) — fix B2.
 * - Con flag off: comportamiento legacy delete+recreate intacto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const eventCreate = vi.fn();
const eventFindFirst = vi.fn();
const eventUpdate = vi.fn();
const participantUpsert = vi.fn();
const participantFindMany = vi.fn();
const auditCreate = vi.fn();
const visitaFindFirst = vi.fn();
const visitaUpdate = vi.fn();
const adminFindFirst = vi.fn();
const linkUpdateMany = vi.fn();
const syncMock = vi.fn();
const flagMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { create: eventCreate, findFirst: eventFindFirst, update: eventUpdate },
    calendarEventParticipant: { upsert: participantUpsert, findMany: participantFindMany },
    calendarExternalAttendee: { upsert: vi.fn() },
    calendarEventReminder: { create: vi.fn() },
    calendarAuditEvent: { create: auditCreate },
    agendaVisita: { findFirst: visitaFindFirst, update: visitaUpdate },
    admin: { findFirst: adminFindFirst },
    agendaEventLink: { updateMany: linkUpdateMany },
    crmContact: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/modules/agenda/agenda-sync", () => ({
  syncAgendaVisitaToCalendar: syncMock,
}));

vi.mock("@/modules/calendar/calendar-flags", () => ({
  isCalendarV2Enabled: flagMock,
}));

const BASE_VISITA = {
  id: "11111111-1111-1111-1111-111111111111",
  tenantId: "t1",
  type: "cliente",
  title: "Visita Codelco",
  accountId: null,
  installationId: null,
  dealId: null,
  assignedUserId: "user-old",
  startAt: new Date("2026-07-22T13:00:00Z"),
  endAt: new Date("2026-07-22T14:00:00Z"),
  notes: null,
  customAddress: null,
  lat: null,
  lng: null,
  contactIds: null,
  status: "programada",
  createdBy: "user-old",
};

beforeEach(() => {
  vi.clearAllMocks();
  syncMock.mockResolvedValue({ syncStatus: "SYNCED" });
  eventCreate.mockImplementation(async ({ data }) => ({ ...data, id: data.id ?? "ev-1" }));
  eventFindFirst.mockResolvedValue(null);
  eventUpdate.mockResolvedValue({});
  participantFindMany.mockResolvedValue([]);
  visitaFindFirst.mockResolvedValue({ ...BASE_VISITA });
  visitaUpdate.mockImplementation(async ({ data }) => ({ ...BASE_VISITA, ...data }));
  adminFindFirst.mockResolvedValue({ id: "user-new" });
});

describe("createCalendarEvent — roles", () => {
  it("creador sin participantes queda como owner", async () => {
    const { createCalendarEvent } = await import("../calendar.service");
    await createCalendarEvent({
      tenantId: "t1",
      createdBy: "creator",
      title: "Reunión",
      startAt: new Date("2026-07-22T13:00:00Z"),
      endAt: new Date("2026-07-22T14:00:00Z"),
    });
    const roles = participantUpsert.mock.calls.map((c) => c[0].create);
    expect(roles).toEqual([
      expect.objectContaining({ userId: "creator", role: "owner" }),
    ]);
  });

  it("con owner explícito, el creador queda como organizer", async () => {
    const { createCalendarEvent } = await import("../calendar.service");
    await createCalendarEvent({
      tenantId: "t1",
      createdBy: "creator",
      title: "Reunión",
      startAt: new Date("2026-07-22T13:00:00Z"),
      endAt: new Date("2026-07-22T14:00:00Z"),
      participants: [{ userId: "other", role: "owner" }],
    });
    const roles = participantUpsert.mock.calls.map((c) => c[0].create);
    expect(roles).toContainEqual(expect.objectContaining({ userId: "other", role: "owner" }));
    expect(roles).toContainEqual(
      expect.objectContaining({ userId: "creator", role: "organizer" }),
    );
  });
});

describe("reprogramAgendaVisita — reasignación", () => {
  it("CALENDAR_V2 on: no borra evento Google ni limpia el link", async () => {
    flagMock.mockReturnValue(true);
    const { reprogramAgendaVisita } = await import("@/modules/agenda/agenda.service");
    const result = await reprogramAgendaVisita(
      "t1",
      BASE_VISITA.id,
      new Date("2026-07-23T13:00:00Z"),
      new Date("2026-07-23T14:00:00Z"),
      "user-new",
    );
    expect(result).not.toBeNull();
    // Nunca se llamó el sync en modo delete y el link no se reseteó.
    expect(syncMock).not.toHaveBeenCalledWith("t1", BASE_VISITA.id, "delete");
    expect(linkUpdateMany).not.toHaveBeenCalled();
    // La visita quedó reasignada.
    expect(visitaUpdate.mock.calls[0][0].data).toMatchObject({
      assignedUserId: "user-new",
    });
  });

  it("CALENDAR_V2 off: conserva legacy delete+recreate", async () => {
    flagMock.mockReturnValue(false);
    const { reprogramAgendaVisita } = await import("@/modules/agenda/agenda.service");
    await reprogramAgendaVisita(
      "t1",
      BASE_VISITA.id,
      new Date("2026-07-23T13:00:00Z"),
      new Date("2026-07-23T14:00:00Z"),
      "user-new",
    );
    expect(syncMock).toHaveBeenCalledWith("t1", BASE_VISITA.id, "delete");
    expect(linkUpdateMany).toHaveBeenCalled();
  });
});
