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
}));

vi.mock("@/modules/calendar/calendar-mapper", () => ({
  mirrorVisitaToV2: vi.fn(),
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
        createdBy: "user-1",
        assignees: [{ userId: "user-2" }],
      },
    ]);
    asMock(prisma.admin.findMany).mockResolvedValue([
      { id: "user-1", name: "Carlos" },
      { id: "user-2", name: "Camila" },
    ]);
    asMock(prisma.crmDeal.findMany).mockResolvedValue([]);
    asMock(prisma.crmAccount.findMany).mockResolvedValue([]);

    const from = new Date("2026-07-22T00:00:00.000Z");
    const to = new Date("2026-07-25T00:00:00.000Z");
    const result = await listAgendaTasks("tenant-1", from, to);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      assignedUserId: "user-2",
      assignedName: "Camila",
    });
    expect(prisma.crmTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          // Ventana + carry-forward de vencidas (dueAt < from).
          OR: [{ dueAt: { gte: from, lt: to } }, { dueAt: { lt: from } }],
        }),
      }),
    );
  });

  it("incluye tareas all-day vencidas (carry-forward)", async () => {
    asMock(prisma.crmTask.findMany).mockResolvedValue([
      {
        id: "task-overdue",
        title: "Crear cuenta ARIBA",
        dueAt: new Date("2026-07-21T13:00:00.000Z"),
        allDay: true,
        dealId: null,
        accountId: "acc-1",
        emailThreadId: null,
        assignedTo: "user-1",
        createdBy: "user-1",
        assignees: [{ userId: "user-1" }],
      },
    ]);
    asMock(prisma.admin.findMany).mockResolvedValue([{ id: "user-1", name: "Carlos" }]);
    asMock(prisma.crmDeal.findMany).mockResolvedValue([]);
    asMock(prisma.crmAccount.findMany).mockResolvedValue([{ id: "acc-1", name: "Enap" }]);

    const result = await listAgendaTasks(
      "tenant-1",
      new Date("2026-07-22T00:00:00.000Z"),
      new Date("2026-07-25T00:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "task-overdue",
      allDay: true,
      accountName: "Enap",
      source: "tarea",
    });
  });

  it("reasigna sin delete+recreate del evento Google", async () => {
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
    asMock(syncAgendaVisitaToCalendar).mockResolvedValue({ syncStatus: "SYNCED" });

    const result = await reprogramAgendaVisita(
      "tenant-1",
      "visit-1",
      start,
      end,
      "user-2",
    );

    expect(syncAgendaVisitaToCalendar).toHaveBeenCalledTimes(1);
    expect(syncAgendaVisitaToCalendar).toHaveBeenCalledWith("tenant-1", "visit-1");
    expect(prisma.agendaEventLink.updateMany).not.toHaveBeenCalled();
    expect(prisma.agendaVisita.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignedUserId: "user-2" }),
      }),
    );
    expect(result?.sync).toEqual({ syncStatus: "SYNCED" });
  });
});
