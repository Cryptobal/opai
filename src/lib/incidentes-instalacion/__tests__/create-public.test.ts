// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const createOpsTicket = vi.fn();
const findManyTickets = vi.fn();
const createManyAttachments = vi.fn();
const notifyIncidenteNuevo = vi.fn();

vi.mock("@/lib/tickets-create", () => ({
  createOpsTicket: (...args: unknown[]) => createOpsTicket(...args),
}));
vi.mock("@/lib/incidentes-instalacion/notify", () => ({
  notifyIncidenteNuevo: (...args: unknown[]) => notifyIncidenteNuevo(...args),
}));
vi.mock("@/lib/incidentes-instalacion/service", () => ({
  resolveReportToken: vi.fn(),
  ensureIncidenteTicketType: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsTicket: { findMany: (...args: unknown[]) => findManyTickets(...args) },
    opsTicketAttachment: { createMany: (...args: unknown[]) => createManyAttachments(...args) },
  },
}));
vi.mock("@/lib/emails/site-url", () => ({
  getCanonicalSiteUrl: () => "https://www.opai.cl",
}));
vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: vi.fn(),
}));

import { resolveReportToken, ensureIncidenteTicketType } from "@/lib/incidentes-instalacion/service";
import { IncidenteError } from "../errors";
import { createPublicReport } from "../create-public";

const INST = {
  id: "inst-1",
  tenantId: "tenant-1",
  name: "Sede Centro",
  address: "Alameda 100",
  city: "Santiago",
  commune: "Santiago",
  lat: -33.4372,
  lng: -70.6506,
  geoRadiusM: 200,
  isActive: true,
  status: "active",
  publicReportEnabled: true,
  publicReportToken: "tok",
  tenantName: "Gard",
  serialLabel: "QR-00001",
  reportQrId: "qr-1",
};

beforeEach(() => {
  vi.mocked(resolveReportToken).mockResolvedValue(INST);
  vi.mocked(ensureIncidenteTicketType).mockResolvedValue({
    id: "type-1",
    slug: "incidente-instalacion",
    name: "Incidente en instalación",
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 4,
  });
  findManyTickets.mockResolvedValue([]);
  createManyAttachments.mockResolvedValue({ count: 0 });
  createOpsTicket.mockResolvedValue({
    id: "t1",
    code: "TK-202608-0001",
    title: "Emergencia: prueba",
    priority: "p2",
    status: "open",
    assignedTeam: "ops",
    source: "public_qr",
    requiresApproval: false,
  });
  notifyIncidenteNuevo.mockResolvedValue(undefined);
});

describe("createPublicReport", () => {
  it("rechaza GPS ausente", async () => {
    await expect(
      createPublicReport({
        token: "abc",
        category: "emergencia",
        description: "Hay una persona herida en el acceso",
        lat: null,
        lng: null,
        files: [],
      }),
    ).rejects.toMatchObject({ code: "GPS_REQUIRED" } satisfies Partial<IncidenteError>);
  });

  it("rechaza fuera de radio", async () => {
    await expect(
      createPublicReport({
        token: "abc",
        category: "emergencia",
        description: "Hay una persona herida en el acceso",
        lat: INST.lat + 0.05,
        lng: INST.lng,
        files: [],
      }),
    ).rejects.toMatchObject({ code: "OUT_OF_RANGE" });
  });

  it("rechaza categoría inválida", async () => {
    await expect(
      createPublicReport({
        token: "abc",
        category: "foo",
        description: "texto suficiente acá",
        lat: INST.lat,
        lng: INST.lng,
        files: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rechaza descripción corta sin archivos", async () => {
    await expect(
      createPublicReport({
        token: "abc",
        category: "otro",
        description: "hi",
        lat: INST.lat,
        lng: INST.lng,
        files: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rechaza storageKey ajeno al tenant", async () => {
    await expect(
      createPublicReport({
        token: "abc",
        category: "otro",
        description: "texto suficiente para pasar",
        lat: INST.lat,
        lng: INST.lng,
        files: [
          {
            storageKey: "otro-tenant/incidentes/x.jpg",
            fileName: "x.jpg",
            contentType: "image/jpeg",
            fileSize: 100,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "FILE_INVALID" });
  });

  it("crea el ticket en el happy path", async () => {
    const result = await createPublicReport({
      token: "abc",
      category: "emergencia",
      description: "Persona herida en el hall",
      lat: INST.lat,
      lng: INST.lng,
      files: [
        {
          storageKey: "tenant-1/incidentes/abc/foto.jpg",
          fileName: "foto.jpg",
          contentType: "image/jpeg",
          fileSize: 1200,
        },
      ],
    });
    expect(result.code).toBe("TK-202608-0001");
    expect(result.followUrl).toContain("/r/seguimiento/");
    expect(createOpsTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "public_qr",
        skipNotify: true,
        installationId: "inst-1",
        metadata: expect.objectContaining({
          publicReport: expect.objectContaining({
            category: "emergencia",
            serialLabel: "QR-00001",
            qrId: "qr-1",
          }),
        }),
      }),
    );
  });
});
