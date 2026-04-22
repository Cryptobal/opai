/**
 * Tests de seguridad para `/api/portal/cliente/rondas/[id]/audit-map` (PR3).
 *
 * Cubre:
 *  - 401 sin sesión.
 *  - 404 uniforme cuando la ronda pertenece a otro tenant/cuenta.
 *  - 200 con payload compatible con `RondaMapView` (walkRoute, routeSnapshot,
 *    marcaciones, checkpointStatuses, routeSource, meta).
 *  - routeSource se elige correctamente (marcaciones vs walk_route vs tracking).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ejecucionFindFirst = vi.fn();
const trackingFindMany = vi.fn();
const marcacionFindMany = vi.fn();
const rondaCheckpointFindMany = vi.fn();
const checkpointFindMany = vi.fn();
const contactFindUnique = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "portal_cliente_session" ? { value: "fake-signed-cookie" } : undefined,
  })),
}));
vi.mock("@/lib/cookie-signature", () => ({
  verifyCookie: vi.fn(() =>
    JSON.stringify({
      contactId: "contact-1",
      tenantId: "tenant-A",
      accountId: "acc-A",
      installations: [{ id: "inst-1", name: "Sede" }],
    }),
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: { findUnique: contactFindUnique },
    opsRondaEjecucion: { findFirst: ejecucionFindFirst },
    opsRondaTracking: { findMany: trackingFindMany },
    opsMarcacionCheckpoint: { findMany: marcacionFindMany },
    opsRondaCheckpoint: { findMany: rondaCheckpointFindMany },
    opsCheckpoint: { findMany: checkpointFindMany },
  },
}));

function makeRequest(url: string): unknown {
  const u = new URL(url);
  return {
    url,
    nextUrl: { searchParams: u.searchParams },
    headers: new Map<string, string>(),
  };
}

beforeEach(() => {
  ejecucionFindFirst.mockReset();
  trackingFindMany.mockReset();
  marcacionFindMany.mockReset();
  rondaCheckpointFindMany.mockReset();
  checkpointFindMany.mockReset();
  contactFindUnique.mockReset();
  contactFindUnique.mockResolvedValue({
    id: "contact-1",
    tenantId: "tenant-A",
    accountId: "acc-A",
    firstName: "Ana",
    lastName: "Cliente",
    email: "ana@acme.cl",
    portalEnabled: true,
    account: {
      status: "client_active",
      isActive: true,
      installations: [{ id: "inst-1" }],
    },
  });
});

describe("GET /api/portal/cliente/rondas/[id]/audit-map", () => {
  it("devuelve 401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });

    const { GET } = await import("../rondas/[id]/audit-map/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r1/audit-map") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(res.status).toBe(401);
    expect(ejecucionFindFirst).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando la ronda es de otro tenant/cuenta", async () => {
    ejecucionFindFirst.mockResolvedValue(null);

    const { GET } = await import("../rondas/[id]/audit-map/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r-ajena/audit-map") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r-ajena" }) },
    );
    expect(res.status).toBe(404);

    // Verificamos que la query aplique el filtro compuesto multi-tenant.
    expect(ejecucionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "r-ajena",
          tenantId: "tenant-A",
          installation: expect.objectContaining({
            is: expect.objectContaining({
              accountId: "acc-A",
              tenantId: "tenant-A",
            }),
          }),
        }),
      }),
    );
  });

  it("devuelve el payload con routeSource=marcaciones cuando hay ≥2 marcaciones GPS", async () => {
    ejecucionFindFirst.mockResolvedValue({
      id: "r1",
      walkRoute: null,
      routeSnapshot: null,
      isAdHoc: false,
      status: "completada",
      scheduledAt: new Date("2026-04-22T02:00:00Z"),
      startedAt: new Date("2026-04-22T02:05:00Z"),
      completedAt: new Date("2026-04-22T02:40:00Z"),
      trustScore: 95,
      rondaTemplateId: "tpl-1",
      installationId: "inst-1",
    });
    trackingFindMany.mockResolvedValue([]);
    marcacionFindMany.mockResolvedValue([
      {
        id: "m1",
        checkpointId: "cp1",
        timestamp: new Date("2026-04-22T02:10:00Z"),
        status: "COMPLETED",
        geoDistanciaM: 5,
        lat: -33.45,
        lng: -70.65,
        geoValidada: true,
        verificationMethod: "nfc",
        checkpoint: { name: "Portón principal" },
      },
      {
        id: "m2",
        checkpointId: "cp2",
        timestamp: new Date("2026-04-22T02:20:00Z"),
        status: "COMPLETED",
        geoDistanciaM: 12,
        lat: -33.46,
        lng: -70.66,
        geoValidada: true,
        verificationMethod: "nfc",
        checkpoint: { name: "Patio norte" },
      },
    ]);
    rondaCheckpointFindMany.mockResolvedValue([
      {
        orderIndex: 1,
        checkpoint: { id: "cp1", name: "Portón principal", lat: -33.45, lng: -70.65 },
      },
      {
        orderIndex: 2,
        checkpoint: { id: "cp2", name: "Patio norte", lat: -33.46, lng: -70.66 },
      },
      {
        orderIndex: 3,
        checkpoint: { id: "cp3", name: "Bodega", lat: -33.47, lng: -70.67 },
      },
    ]);

    const { GET } = await import("../rondas/[id]/audit-map/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r1/audit-map") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.routeSource).toBe("marcaciones");
    expect(body.data.marcaciones).toHaveLength(2);
    // cp3 debe aparecer como PENDING (no fue marcado).
    expect(body.data.checkpointStatuses).toHaveLength(3);
    const cp3 = body.data.checkpointStatuses.find((c: { id: string }) => c.id === "cp3");
    expect(cp3?.status).toBe("PENDING");
    const cp1 = body.data.checkpointStatuses.find((c: { id: string }) => c.id === "cp1");
    expect(cp1?.status).toBe("COMPLETED");
    expect(cp1?.geoValidada).toBe(true);
  });

  it("cae a walk_route cuando hay <2 marcaciones con coords", async () => {
    ejecucionFindFirst.mockResolvedValue({
      id: "r1",
      walkRoute: [
        { lat: -33.45, lng: -70.65 },
        { lat: -33.46, lng: -70.66 },
        { lat: -33.47, lng: -70.67 },
      ],
      routeSnapshot: null,
      isAdHoc: true,
      status: "completada",
      scheduledAt: new Date("2026-04-22T02:00:00Z"),
      startedAt: null,
      completedAt: null,
      trustScore: 0,
      rondaTemplateId: null,
      installationId: "inst-1",
    });
    trackingFindMany.mockResolvedValue([]);
    marcacionFindMany.mockResolvedValue([]);
    checkpointFindMany.mockResolvedValue([]);

    const { GET } = await import("../rondas/[id]/audit-map/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r1/audit-map") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.routeSource).toBe("walk_route");
    expect(body.data.walkRoute).toHaveLength(3);
    expect(body.data.meta.isAdHoc).toBe(true);
  });

  it("devuelve routeSource=none cuando no hay datos de ubicación", async () => {
    ejecucionFindFirst.mockResolvedValue({
      id: "r1",
      walkRoute: null,
      routeSnapshot: null,
      isAdHoc: false,
      status: "no_realizada",
      scheduledAt: new Date("2026-04-22T02:00:00Z"),
      startedAt: null,
      completedAt: null,
      trustScore: 0,
      rondaTemplateId: null,
      installationId: "inst-1",
    });
    trackingFindMany.mockResolvedValue([]);
    marcacionFindMany.mockResolvedValue([]);
    checkpointFindMany.mockResolvedValue([]);

    const { GET } = await import("../rondas/[id]/audit-map/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r1/audit-map") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.routeSource).toBe("none");
    expect(body.data.walkRoute).toBeNull();
    expect(body.data.marcaciones).toEqual([]);
    expect(body.data.checkpointStatuses).toEqual([]);
  });
});
