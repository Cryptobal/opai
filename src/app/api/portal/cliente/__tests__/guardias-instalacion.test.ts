/**
 * Tests para `/api/portal/cliente/instalaciones/[id]/guardias` (PR7).
 *
 * Cubre:
 *  - 401 sin sesión.
 *  - 404 cross-tenant (ensureInstallationAccess falla).
 *  - Shape con nombre + iniciales (sin RUT/email/pin/faceId).
 *  - Resumen global (totalGuardias + OS-10 vigente/por_vencer/vencido).
 *  - Filtra solo guardias activos de la instalación.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const guardiaFindMany = vi.fn();
const installationFindFirst = vi.fn();
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
    opsGuardia: { findMany: guardiaFindMany },
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
  guardiaFindMany.mockReset();
  installationFindFirst.mockReset();
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

describe("GET /api/portal/cliente/instalaciones/[id]/guardias", () => {
  it("devuelve 401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    const { GET } = await import(
      "../instalaciones/[id]/guardias/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/guardias",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    expect(res.status).toBe(401);
    expect(guardiaFindMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 cross-tenant", async () => {
    installationFindFirst.mockResolvedValue(null);
    const { GET } = await import(
      "../instalaciones/[id]/guardias/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-otra/guardias",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-otra" }) },
    );
    expect(res.status).toBe(404);
    expect(guardiaFindMany).not.toHaveBeenCalled();
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

  it("devuelve lista + resumen + solo campos cliente-friendly (sin PII)", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 10);
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 2);

    guardiaFindMany.mockResolvedValue([
      {
        id: "g1",
        hiredAt: new Date("2024-03-01"),
        os10: true,
        os10ExpiresAt: futureDate,
        persona: { firstName: "Juan", lastName: "Pérez" },
        documents: [
          {
            type: "certificado_os10",
            status: "validated",
            expiresAt: futureDate,
            fileUrl: "https://cdn/os10-juan.pdf",
          },
          {
            type: "contrato",
            status: "validated",
            expiresAt: null,
            fileUrl: null,
          },
        ],
      },
      {
        id: "g2",
        hiredAt: new Date("2025-08-10"),
        os10: true,
        os10ExpiresAt: soonDate, // por vencer
        persona: { firstName: "María", lastName: "González" },
        documents: [
          {
            type: "certificado_antecedentes",
            status: "validated",
            expiresAt: pastDate, // vencido
            fileUrl: "https://cdn/ant.pdf",
          },
        ],
      },
      {
        id: "g3",
        hiredAt: null,
        os10: false,
        os10ExpiresAt: null,
        persona: { firstName: "Luis", lastName: "Soto" },
        documents: [],
      },
    ]);

    const { GET } = await import(
      "../instalaciones/[id]/guardias/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/guardias",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const { guardias, resumen } = body.data;
    expect(guardias).toHaveLength(3);

    // Shape mínimo + iniciales.
    const g1 = guardias[0];
    expect(Object.keys(g1).sort()).toEqual(
      [
        "documentos",
        "hiredAt",
        "id",
        "iniciales",
        "nombre",
        "os10Estado",
        "os10ExpiresAt",
        "resumen",
      ].sort(),
    );
    expect(g1.iniciales).toBe("JP");
    expect(g1.os10Estado).toBe("vigente");

    // PII explícitamente ausente.
    for (const g of guardias as Array<Record<string, unknown>>) {
      expect(g).not.toHaveProperty("personaId");
      expect(g).not.toHaveProperty("rut");
      expect(g).not.toHaveProperty("email");
      expect(g).not.toHaveProperty("phone");
      expect(g).not.toHaveProperty("marcacionPin");
      expect(g).not.toHaveProperty("marcacionPinVisible");
      expect(g).not.toHaveProperty("faceIdPhotoUrl");
      expect(g).not.toHaveProperty("googleEmail");
    }

    // OS-10 estado derivado
    const byId = Object.fromEntries(
      guardias.map((g: { id: string; os10Estado: string }) => [g.id, g.os10Estado]),
    );
    expect(byId.g1).toBe("vigente");
    expect(byId.g2).toBe("por_vencer");
    expect(byId.g3).toBe("vencido"); // os10 === false

    // Resumen global
    expect(resumen).toEqual({
      totalGuardias: 3,
      os10Vigente: 1,
      os10PorVencer: 1,
      os10Vencido: 1,
    });

    // Guardia 2: doc antecedentes vencido debe reflejarse en su resumen individual.
    const g2 = guardias.find((g: { id: string }) => g.id === "g2");
    expect(g2.resumen.vencidos).toBe(1);
  });

  it("la query Prisma filtra por tenantId + currentInstallationId + status active", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    guardiaFindMany.mockResolvedValue([]);

    const { GET } = await import(
      "../instalaciones/[id]/guardias/route"
    );
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/guardias",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );

    // La ruta delega en loadGuardiasForInstallations (helper compartido
    // multi-instalación): el filtro va como `{ in: [...] }` aunque sea una sola.
    expect(guardiaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          currentInstallationId: { in: ["inst-1"] },
          status: "active",
        }),
      }),
    );

    // El select de documents debe exigir portalVisible y OR para folders.
    const selectArg = guardiaFindMany.mock.calls[0][0].select;
    expect(selectArg.documents.where).toEqual(
      expect.objectContaining({
        portalVisible: true,
        OR: expect.arrayContaining([
          { folderId: null },
          { folder: { portalVisible: true } },
        ]),
      }),
    );
  });
});
