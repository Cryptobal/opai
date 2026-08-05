import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaVisita: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    agendaEventLink: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    calendarEvent: { updateMany: vi.fn() },
    crmInstallation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    cpqQuote: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    opsPuestoOperativo: { count: vi.fn() },
    opsPautaMensual: { count: vi.fn() },
    opsMarcacion: { count: vi.fn() },
    opsAsignacionGuardia: { count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        agendaVisita: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          updateMany: vi.fn(),
        },
        calendarEvent: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        agendaEventLink: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        cpqQuote: { updateMany: vi.fn() },
        crmInstallation: { deleteMany: vi.fn() },
        crmDeal: { delete: vi.fn() },
        cpqProposalBundle: { deleteMany: vi.fn() },
      };
      return fn(tx);
    }),
  },
}));

vi.mock("@/modules/calendar/calendar-write", () => ({
  cancelOpaiEvent: vi.fn(),
}));

vi.mock("@/modules/calendar/calendar-google-sync", () => ({
  syncCalendarEventToGoogle: vi.fn(),
}));

vi.mock("@/modules/agenda/agenda-sync-licitacion", () => ({
  syncLicitacionToCalendar: vi.fn(),
}));

vi.mock("@/modules/calendar/calendar-audit", () => ({
  recordCalendarAudit: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { cancelOpaiEvent } from "@/modules/calendar/calendar-write";
import { syncLicitacionToCalendar } from "@/modules/agenda/agenda-sync-licitacion";
import {
  cascadeCancelDealAgenda,
  loadDealInstallationImpact,
} from "../deal-delete-cascade";

describe("cascadeCancelDealAgenda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancela tres hitos en Google, elimina visitas y limpia link de licitación", async () => {
    vi.mocked(prisma.agendaVisita.findMany).mockResolvedValue([
      { id: "v1", status: "programada" },
      { id: "v2", status: "programada" },
      { id: "v3", status: "programada" },
    ] as never);
    vi.mocked(cancelOpaiEvent)
      .mockResolvedValueOnce({ eventId: "v1", syncStatus: "CANCELLED" } as never)
      .mockResolvedValueOnce({ eventId: "v2", syncStatus: "CANCELLED" } as never)
      .mockResolvedValueOnce({ eventId: "v3", syncStatus: "CANCELLED" } as never);
    vi.mocked(prisma.agendaEventLink.findFirst).mockResolvedValue({
      id: "lic-1",
      googleEventId: "g-lic",
    } as never);
    vi.mocked(syncLicitacionToCalendar).mockResolvedValue({ syncStatus: "CANCELLED" });
    vi.mocked(prisma.agendaEventLink.deleteMany).mockResolvedValue({ count: 1 } as never);

    const result = await cascadeCancelDealAgenda({
      tenantId: "t1",
      dealId: "d1",
      actorUserId: "u1",
    });

    expect(cancelOpaiEvent).toHaveBeenCalledTimes(3);
    expect(cancelOpaiEvent).toHaveBeenNthCalledWith(1, "t1", "v1", "u1");
    expect(cancelOpaiEvent).toHaveBeenNthCalledWith(2, "t1", "v2", "u1");
    expect(cancelOpaiEvent).toHaveBeenNthCalledWith(3, "t1", "v3", "u1");
    expect(syncLicitacionToCalendar).toHaveBeenCalledWith("t1", "d1", "delete", {
      actorUserId: "u1",
    });
    expect(result.deletedVisitas).toEqual(["v1", "v2", "v3"]);
    expect(result.licitacionLinkDeleted).toBe(true);
    expect(result.googleErrors).toEqual([]);
  });

  it("no aborta si Google falla en una visita", async () => {
    vi.mocked(prisma.agendaVisita.findMany).mockResolvedValue([
      { id: "v1", status: "programada" },
    ] as never);
    vi.mocked(cancelOpaiEvent).mockResolvedValue({
      eventId: "v1",
      syncStatus: "ERROR",
    } as never);
    vi.mocked(prisma.agendaEventLink.findFirst).mockResolvedValue(null as never);

    const result = await cascadeCancelDealAgenda({
      tenantId: "t1",
      dealId: "d1",
      actorUserId: "u1",
    });

    expect(result.deletedVisitas).toEqual(["v1"]);
    expect(result.googleErrors).toHaveLength(1);
  });
});

describe("loadDealInstallationImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.opsPuestoOperativo.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.opsPautaMensual.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.opsMarcacion.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.opsAsignacionGuardia.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.cpqQuote.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.crmInstallation.count).mockResolvedValue(0 as never);
  });

  it("bloquea instalación usada por cotizaciones de otro negocio", async () => {
    vi.mocked(prisma.crmInstallation.findMany).mockResolvedValue([
      { id: "inst-1", name: "Planta Coexpan" },
    ] as never);
    vi.mocked(prisma.cpqQuote.count)
      .mockResolvedValueOnce(2 as never) // otherDealQuotes
      .mockResolvedValueOnce(0 as never); // orphanQuotes

    const impact = await loadDealInstallationImpact("t1", "d1", ["q1"]);
    expect(impact?.canDelete).toBe(false);
    expect(impact?.deleteByDefault).toBe(false);
    expect(impact?.blockers[0]?.code).toBe("INSTALLATION_OTHER_DEAL_QUOTES");
    expect(impact?.blockers[0]?.label).toContain("2 cotizaciones de otro negocio");
  });

  it("permite borrar instalación sin referencias externas", async () => {
    vi.mocked(prisma.crmInstallation.findMany).mockResolvedValue([
      { id: "inst-1", name: "Planta Coexpan" },
    ] as never);

    const impact = await loadDealInstallationImpact("t1", "d1", ["q1"]);
    expect(impact?.canDelete).toBe(true);
    expect(impact?.deleteByDefault).toBe(true);
    expect(impact?.blockers).toEqual([]);
  });
});
