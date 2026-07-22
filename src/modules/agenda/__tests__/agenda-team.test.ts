import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmTask: { findMany: vi.fn() },
    crmDeal: { findMany: vi.fn() },
    crmAccount: { findMany: vi.fn() },
    admin: { findMany: vi.fn(), findFirst: vi.fn() },
    agendaVisita: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    agendaEventLink: { updateMany: vi.fn() },
  },
}));

vi.mock("../agenda-sync", () => ({
  syncAgendaVisitaToCalendar: vi.fn(),
  syncVisitaTecnicaToCalendar: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { listAgendaTasks } from "../agenda-tasks";
import { reprogramAgendaVisita } from "../agenda.service";
import { syncAgendaVisitaToCalendar } from "../agenda-sync";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agenda de equipo", () => {
  it("lista tareas de todos los responsables con su nombre", async () => {
    asMock(prisma.crmTask.findMany).mockResolvedValue([
      {
        id: "task-1",
        title: "Preparar propuesta",
        dueAt: new Date("2026-07-23T14:00:00.000Z"),
        allDay: false,
        dealId: null,
        accountId: null,
        emailThreadId: null,
        assignedTo: "user-2",
      },
    ]);
    asMock(prisma.admin.findMany).mockResolvedValue([
      { id: "user-1", name: "Carlos" },
      { id: "user-2", name: "Camila" },
    ]);
    asMock(prisma.crmDeal.findMany).mockResolvedValue([]);
    asMock(prisma.crmAccount.findMany).mockResolvedValue([]);

    const result = await listAgendaTasks(
      "tenant-1",
      new Date("2026-07-22T00:00:00.000Z"),
      new Date("2026-07-25T00:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      assignedUserId: "user-2",
      assignedName: "Camila",
    });
    expect(prisma.crmTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ assignedTo: expect.anything() }),
      }),
    );
  });

  it("mueve una visita al calendario del nuevo responsable", async () => {
    const start = new Date("2026-07-24T14:00:00.000Z");
    const end = new Date("2026-07-24T15:00:00.000Z");
    asMock(prisma.agendaVisita.findFirst).mockResolvedValue({
      id: "visit-1",
      assignedUserId: "user-1",
    });
    asMock(prisma.admin.findFirst).mockResolvedValue({ id: "user-2" });
    asMock(prisma.agendaVisita.update).mockResolvedValue({
      id: "visit-1",
      assignedUserId: "user-2",
      startAt: start,
      endAt: end,
    });
    asMock(syncAgendaVisitaToCalendar)
      .mockResolvedValueOnce({ syncStatus: "CANCELLED" })
      .mockResolvedValueOnce({ syncStatus: "SYNCED" });

    const result = await reprogramAgendaVisita(
      "tenant-1",
      "visit-1",
      start,
      end,
      "user-2",
    );

    expect(syncAgendaVisitaToCalendar).toHaveBeenNthCalledWith(
      1,
      "tenant-1",
      "visit-1",
      "delete",
    );
    expect(prisma.agendaEventLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleEventId: null,
          googleCalendarId: null,
          syncStatus: "PENDING",
        }),
      }),
    );
    expect(prisma.agendaVisita.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignedUserId: "user-2" }),
      }),
    );
    expect(result?.sync).toEqual({ syncStatus: "SYNCED" });
  });
});
