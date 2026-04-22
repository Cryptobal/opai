/**
 * Tests para `/api/portal/cliente/instalaciones/[id]/marcaciones` (PR6).
 *
 * Cubre:
 *  - 401 sin sesión.
 *  - 404 cross-tenant (ensureInstallationAccess falla).
 *  - Auth válida + compute de `estado` por marcación.
 *  - Filtros: tipo, estado, rango fecha, query guardia.
 *  - Resumen con totales por estado.
 *  - Prisma queries llevan tenantId + installationId.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeMarcacionEstado } from "@/lib/portal-cliente-marcacion-estado";

const installationFindFirst = vi.fn();
const marcacionFindMany = vi.fn();
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
    crmInstallation: { findFirst: installationFindFirst },
    opsMarcacion: { findMany: marcacionFindMany },
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
  installationFindFirst.mockReset();
  marcacionFindMany.mockReset();
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

describe("computeMarcacionEstado", () => {
  it("devuelve 'fuera_rango' cuando gpsStatus=fuera_rango (prioridad máxima)", () => {
    expect(
      computeMarcacionEstado({
        gpsStatus: "fuera_rango",
        fotoEvidenciaUrl: "https://cdn/f",
        lat: -33.45,
        lng: -70.65,
      }),
    ).toBe("fuera_rango");
  });
  it("devuelve 'sin_gps' cuando no hay lat/lng", () => {
    expect(
      computeMarcacionEstado({
        gpsStatus: null,
        fotoEvidenciaUrl: "https://cdn/f",
        lat: null,
        lng: null,
      }),
    ).toBe("sin_gps");
  });
  it("devuelve 'sin_foto' cuando hay GPS válido pero sin foto", () => {
    expect(
      computeMarcacionEstado({
        gpsStatus: "dentro_rango",
        fotoEvidenciaUrl: null,
        lat: -33.45,
        lng: -70.65,
      }),
    ).toBe("sin_foto");
  });
  it("devuelve 'ok' cuando todo está OK", () => {
    expect(
      computeMarcacionEstado({
        gpsStatus: "dentro_rango",
        fotoEvidenciaUrl: "https://cdn/f",
        lat: -33.45,
        lng: -70.65,
      }),
    ).toBe("ok");
  });
});

describe("GET /api/portal/cliente/instalaciones/[id]/marcaciones", () => {
  it("devuelve 401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    const { GET } = await import(
      "../instalaciones/[id]/marcaciones/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/marcaciones",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    expect(res.status).toBe(401);
    expect(marcacionFindMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 cross-tenant", async () => {
    installationFindFirst.mockResolvedValue(null);
    const { GET } = await import(
      "../instalaciones/[id]/marcaciones/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-otra/marcaciones",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-otra" }) },
    );
    expect(res.status).toBe(404);
    expect(marcacionFindMany).not.toHaveBeenCalled();

    expect(installationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "inst-otra",
          accountId: "acc-A",
          tenantId: "tenant-A",
        }),
      }),
    );
  });

  it("computa estado y resumen por marcación", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1", name: "Sede" });
    marcacionFindMany.mockResolvedValue([
      {
        id: "m1",
        tipo: "entrada",
        timestamp: new Date("2026-04-22T09:00:00Z"),
        geoValidada: true,
        geoDistanciaM: 5,
        gpsStatus: "dentro_rango",
        lat: -33.45,
        lng: -70.65,
        metodoId: "face_id",
        fotoEvidenciaUrl: "https://cdn/ok.jpg",
        guardia: { persona: { firstName: "Ana", lastName: "López" } },
      },
      {
        id: "m2",
        tipo: "salida",
        timestamp: new Date("2026-04-22T18:00:00Z"),
        geoValidada: false,
        geoDistanciaM: 150,
        gpsStatus: "fuera_rango",
        lat: -33.46,
        lng: -70.66,
        metodoId: "foto",
        fotoEvidenciaUrl: "https://cdn/out.jpg",
        guardia: { persona: { firstName: "Ana", lastName: "López" } },
      },
      {
        id: "m3",
        tipo: "entrada",
        timestamp: new Date("2026-04-21T08:00:00Z"),
        geoValidada: false,
        geoDistanciaM: null,
        gpsStatus: null,
        lat: null,
        lng: null,
        metodoId: "manual",
        fotoEvidenciaUrl: null,
        guardia: { persona: { firstName: "José", lastName: "Pérez" } },
      },
      {
        id: "m4",
        tipo: "entrada",
        timestamp: new Date("2026-04-21T20:00:00Z"),
        geoValidada: true,
        geoDistanciaM: 3,
        gpsStatus: "dentro_rango",
        lat: -33.45,
        lng: -70.65,
        metodoId: "face_id",
        fotoEvidenciaUrl: null, // sin foto
        guardia: { persona: { firstName: "José", lastName: "Pérez" } },
      },
    ]);

    const { GET } = await import(
      "../instalaciones/[id]/marcaciones/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/marcaciones",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const byId = Object.fromEntries(
      body.data.marcaciones.map((m: { id: string; estado: string }) => [m.id, m.estado]),
    );
    expect(byId.m1).toBe("ok");
    expect(byId.m2).toBe("fuera_rango");
    expect(byId.m3).toBe("sin_gps");
    expect(byId.m4).toBe("sin_foto");

    expect(body.data.resumen).toEqual({
      total: 4,
      entradas: 3,
      salidas: 1,
      ok: 1,
      fueraRango: 1,
      sinGps: 1,
      sinFoto: 1,
    });
  });

  it("filtra por tipo y rango fecha a nivel de Prisma + estado/q en memoria", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1", name: "Sede" });
    marcacionFindMany.mockResolvedValue([
      {
        id: "m1",
        tipo: "entrada",
        timestamp: new Date("2026-04-22T09:00:00Z"),
        geoValidada: true,
        geoDistanciaM: 5,
        gpsStatus: "dentro_rango",
        lat: -33.45,
        lng: -70.65,
        metodoId: null,
        fotoEvidenciaUrl: "https://cdn/ok.jpg",
        guardia: { persona: { firstName: "Ana", lastName: "López" } },
      },
      {
        id: "m2",
        tipo: "entrada",
        timestamp: new Date("2026-04-22T10:00:00Z"),
        geoValidada: false,
        geoDistanciaM: 150,
        gpsStatus: "fuera_rango",
        lat: -33.46,
        lng: -70.66,
        metodoId: null,
        fotoEvidenciaUrl: null,
        guardia: { persona: { firstName: "José", lastName: "Pérez" } },
      },
    ]);

    const { GET } = await import(
      "../instalaciones/[id]/marcaciones/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/marcaciones?tipo=entrada&estado=fuera_rango&q=jos&from=2026-04-22T00:00:00Z&to=2026-04-23T00:00:00Z",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    const body = await res.json();

    // Prisma debe recibir tipo + timestamp filter + tenant/installation.
    expect(marcacionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          installationId: "inst-1",
          deletedAt: null,
          tipo: "entrada",
          timestamp: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      }),
    );

    // Filtro estado+q se aplicó en memoria → solo m2 (fuera_rango, guardia José).
    expect(body.data.marcaciones).toHaveLength(1);
    expect(body.data.marcaciones[0].id).toBe("m2");
    expect(body.data.resumen.total).toBe(1);
    expect(body.data.resumen.fueraRango).toBe(1);
  });

  it("ignora filtros inválidos (tipo=XYZ, estado=hack)", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1", name: "Sede" });
    marcacionFindMany.mockResolvedValue([]);
    const { GET } = await import(
      "../instalaciones/[id]/marcaciones/route"
    );
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/marcaciones?tipo=XYZ&estado=hack",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    const whereArg = marcacionFindMany.mock.calls[0][0].where;
    expect(whereArg.tipo).toBeUndefined();
  });
});
