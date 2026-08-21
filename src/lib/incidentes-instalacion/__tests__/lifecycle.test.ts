// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const count = vi.fn();
const createMany = vi.fn();
const commentCreate = vi.fn();
const findMany = vi.fn();
const recordTicketEvent = vi.fn();
const notifyCerrado = vi.fn();
const notifyValidado = vi.fn();
const notifyRechazado = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsTicket: { findFirst, update, updateMany, findMany },
    opsTicketAttachment: { count, createMany },
    opsTicketComment: { create: commentCreate },
  },
}));
vi.mock("@/lib/tickets-events", () => ({
  recordTicketEvent: (...args: unknown[]) => recordTicketEvent(...args),
}));
vi.mock("@/lib/incidentes-instalacion/notify", () => ({
  notifyIncidenteCerrado: (...args: unknown[]) => notifyCerrado(...args),
  notifyIncidenteValidado: (...args: unknown[]) => notifyValidado(...args),
  notifyIncidenteRechazado: (...args: unknown[]) => notifyRechazado(...args),
}));
vi.mock("@/lib/tickets-csat", () => ({
  generateCsatToken: () => "csat",
  defaultCsatExpiry: () => new Date("2026-09-21"),
}));

import { IncidenteError } from "../errors";
import { cerrarIncidente, validarIncidente, rechazarIncidente } from "../lifecycle";

const TICKET = {
  id: "t1",
  tenantId: "ten",
  code: "TK-1",
  title: "Emergencia",
  status: "in_progress",
  installationId: "inst",
  guardiaId: "g1",
  assignedTo: null,
  metadata: {},
  resolutionNotes: null,
  csatToken: null,
  ticketType: { slug: "incidente-instalacion" },
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(TICKET);
  update.mockResolvedValue({ id: "t1", status: "resolved" });
  updateMany.mockResolvedValue({ count: 1 });
  count.mockResolvedValue(0);
  createMany.mockResolvedValue({ count: 1 });
  commentCreate.mockResolvedValue({ id: "c1" });
  notifyCerrado.mockResolvedValue(undefined);
  notifyValidado.mockResolvedValue(undefined);
  notifyRechazado.mockResolvedValue(undefined);
});

describe("cerrarIncidente", () => {
  it("422 sin comentario", async () => {
    await expect(
      cerrarIncidente({ tenantId: "ten", ticketId: "t1", actorId: "a", comment: "hi" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" } satisfies Partial<IncidenteError>);
  });

  it("422 sin foto de cierre", async () => {
    await expect(
      cerrarIncidente({
        tenantId: "ten",
        ticketId: "t1",
        actorId: "a",
        comment: "Atendido en terreno con evidencia",
        files: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("cierra con foto y comentario", async () => {
    const result = await cerrarIncidente({
      tenantId: "ten",
      ticketId: "t1",
      actorId: "a",
      comment: "Quedó resuelto con ronda extra",
      files: [
        {
          storageKey: "ten/incidentes/x.jpg",
          fileName: "cierre.jpg",
          contentType: "image/jpeg",
          fileSize: 100,
        },
      ],
    });
    expect(result.status).toBe("resolved");
    expect(createMany).toHaveBeenCalled();
  });
});

describe("validarIncidente", () => {
  it("409 si otro supervisor ya validó", async () => {
    findFirst.mockResolvedValue({ ...TICKET, status: "resolved" });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      validarIncidente({ tenantId: "ten", ticketId: "t1", actorId: "s1", actorName: "Ana" }),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  it("cierra cuando el update condicional gana", async () => {
    findFirst.mockResolvedValue({ ...TICKET, status: "resolved" });
    const result = await validarIncidente({
      tenantId: "ten",
      ticketId: "t1",
      actorId: "s1",
      actorName: "Ana",
    });
    expect(result.status).toBe("closed");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "resolved" }),
      }),
    );
  });
});

describe("rechazarIncidente", () => {
  it("exige motivo y vuelve a in_progress", async () => {
    findFirst.mockResolvedValue({ ...TICKET, status: "resolved" });
    const result = await rechazarIncidente({
      tenantId: "ten",
      ticketId: "t1",
      actorId: "s1",
      actorName: "Ana",
      reason: "Falta evidencia del perímetro norte",
    });
    expect(result.status).toBe("in_progress");
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isInternal: true }),
      }),
    );
  });

  it("no permite rechazar un closed", async () => {
    findFirst.mockResolvedValue({ ...TICKET, status: "closed" });
    await expect(
      rechazarIncidente({
        tenantId: "ten",
        ticketId: "t1",
        actorId: "s1",
        actorName: "Ana",
        reason: "motivo suficiente",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
