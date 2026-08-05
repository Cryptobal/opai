import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaVisita: { findFirst: vi.fn() },
  },
}));

vi.mock("@/modules/calendar/calendar-write", () => ({
  createOpaiEvent: vi.fn(),
  updateOpaiEvent: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { createOpaiEvent, updateOpaiEvent } from "@/modules/calendar/calendar-write";
import {
  createDealMilestoneEvent,
  upsertDealMilestoneEvent,
} from "@/modules/agenda/deal-milestones";

describe("upsertDealMilestoneEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("actualiza en la segunda ejecución en lugar de duplicar", async () => {
    const startAt = new Date("2026-08-17T13:00:00.000Z");
    const endAt = new Date("2026-08-17T14:00:00.000Z");

    vi.mocked(prisma.agendaVisita.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(createOpaiEvent).mockResolvedValue({
      eventId: "ev-1",
      syncStatus: "SYNCED",
      htmlLink: null,
      visita: {
        id: "ev-1",
        title: "Cierre de consultas",
        type: "otra",
        label: "Consultas",
        assignedUserId: "u1",
        dealId: "d1",
        status: "programada",
      },
    } as never);

    const first = await upsertDealMilestoneEvent({
      tenantId: "t1",
      actorUserId: "u1",
      dealId: "d1",
      kind: "consultas",
      startAt,
      endAt,
    });
    expect(first.action).toBe("creado");
    expect(createOpaiEvent).toHaveBeenCalledTimes(1);

    vi.mocked(prisma.agendaVisita.findFirst).mockResolvedValueOnce({
      id: "ev-1",
    } as never);
    vi.mocked(updateOpaiEvent).mockResolvedValue({
      eventId: "ev-1",
      syncStatus: "SYNCED",
      htmlLink: null,
      visita: {
        id: "ev-1",
        title: "Cierre de consultas",
        type: "otra",
        label: "Consultas",
        assignedUserId: "u1",
        dealId: "d1",
        status: "programada",
      },
    } as never);

    const second = await upsertDealMilestoneEvent({
      tenantId: "t1",
      actorUserId: "u1",
      dealId: "d1",
      kind: "consultas",
      startAt: new Date("2026-08-17T15:00:00.000Z"),
      endAt: new Date("2026-08-17T16:00:00.000Z"),
      participantIds: ["rafael"],
    });

    expect(second.action).toBe("actualizado");
    expect(second.eventId).toBe("ev-1");
    expect(createOpaiEvent).toHaveBeenCalledTimes(1);
    expect(updateOpaiEvent).toHaveBeenCalledTimes(1);
    expect(updateOpaiEvent).toHaveBeenCalledWith(
      "t1",
      "ev-1",
      expect.objectContaining({ participantIds: ["rafael"] }),
      "u1",
    );
  });
});

describe("createDealMilestoneEvent", () => {
  it("existe para creación directa", async () => {
    vi.mocked(createOpaiEvent).mockResolvedValue({
      eventId: "ev-2",
      syncStatus: "PENDING",
      htmlLink: null,
      visita: {
        id: "ev-2",
        title: "Visita técnica",
        type: "otra",
        label: "Visita técnica",
        assignedUserId: "u1",
        dealId: "d1",
        status: "programada",
      },
    } as never);
    const created = await createDealMilestoneEvent({
      tenantId: "t1",
      actorUserId: "u1",
      dealId: "d1",
      kind: "visita_tecnica",
      startAt: new Date(),
      endAt: new Date(),
    });
    expect(created.eventId).toBe("ev-2");
  });
});
