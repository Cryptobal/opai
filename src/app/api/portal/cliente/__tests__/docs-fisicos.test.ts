/**
 * Tests del endpoint `/api/portal/cliente/instalaciones/[id]/docs-fisicos` (PR4).
 *
 * Cubre:
 *  - 401 sin sesión.
 *  - 404 cuando la instalación pertenece a otro tenant/cuenta.
 *  - Shape del payload: `items[]` con tipo, verificacion (última) y estado.
 *  - Nunca expone `hallazgo` ni `ticket` (flujo operativo interno).
 *  - `sin_verificar` para tipos que nunca fueron auditados.
 *  - Resumen computa presentes/ausentes/sinVerificar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tipoFindMany = vi.fn();
const verifFindMany = vi.fn();
const contactFindUnique = vi.fn();
const installationFindFirst = vi.fn();

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
    tipoDocOperacional: { findMany: tipoFindMany },
    docVerificacionFisica: { findMany: verifFindMany },
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
  tipoFindMany.mockReset();
  verifFindMany.mockReset();
  contactFindUnique.mockReset();
  installationFindFirst.mockReset();
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

describe("GET /api/portal/cliente/instalaciones/[id]/docs-fisicos", () => {
  it("devuelve 401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    const { GET } = await import(
      "../instalaciones/[id]/docs-fisicos/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/docs-fisicos",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    expect(res.status).toBe(401);
    expect(tipoFindMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando la instalación es de otro tenant/cuenta", async () => {
    installationFindFirst.mockResolvedValue(null);

    const { GET } = await import(
      "../instalaciones/[id]/docs-fisicos/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-otra/docs-fisicos",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-otra" }) },
    );
    expect(res.status).toBe(404);
    expect(tipoFindMany).not.toHaveBeenCalled();

    // ensureInstallationAccess debe filtrar por accountId + tenantId.
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

  it("construye el checklist con items + resumen y nunca expone hallazgo/ticket", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    tipoFindMany.mockResolvedValue([
      {
        id: "tipo-1",
        codigo: "reglamento",
        nombre: "Reglamento interno",
        descripcion: null,
        capa: "instalacion",
        obligatorio: true,
        normativa: "D.S. 93 Art. 13",
      },
      {
        id: "tipo-2",
        codigo: "bitacora",
        nombre: "Bitácora de novedades",
        descripcion: null,
        capa: "instalacion",
        obligatorio: true,
        normativa: null,
      },
      {
        id: "tipo-3",
        codigo: "os10",
        nombre: "OS-10 empresa",
        descripcion: null,
        capa: "global",
        obligatorio: true,
        normativa: null,
      },
    ]);
    verifFindMany.mockResolvedValue([
      {
        id: "v1",
        tipoDocId: "tipo-1",
        presente: true,
        photoUrl: "https://r2.example/reglamento.jpg",
        notes: "Visible en sala del guardia",
        createdAt: new Date("2026-04-01T10:00:00Z"),
        supervisor: { name: "Juan Supervisor" },
      },
      {
        id: "v2",
        tipoDocId: "tipo-2",
        presente: false,
        photoUrl: null,
        notes: "No encontrada en visita",
        createdAt: new Date("2026-04-01T10:05:00Z"),
        supervisor: { name: "Juan Supervisor" },
      },
    ]);

    const { GET } = await import(
      "../instalaciones/[id]/docs-fisicos/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/docs-fisicos",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const { items, resumen } = body.data;
    expect(items).toHaveLength(3);
    expect(resumen).toEqual({
      total: 3,
      presentes: 1,
      ausentes: 1,
      sinVerificar: 1,
    });

    const byTipoId = Object.fromEntries(
      items.map((i: { tipo: { id: string } }) => [i.tipo.id, i]),
    );
    expect(byTipoId["tipo-1"].estado).toBe("presente");
    expect(byTipoId["tipo-1"].verificacion.photoUrl).toBe(
      "https://r2.example/reglamento.jpg",
    );
    expect(byTipoId["tipo-1"].verificacion.supervisorName).toBe("Juan Supervisor");

    expect(byTipoId["tipo-2"].estado).toBe("ausente");
    expect(byTipoId["tipo-3"].estado).toBe("sin_verificar");
    expect(byTipoId["tipo-3"].verificacion).toBeNull();

    // Asegurar que ningún item contiene hallazgos/tickets (flujo interno).
    for (const item of items as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("hallazgo");
      expect(item).not.toHaveProperty("hallazgos");
      expect(item).not.toHaveProperty("ticket");
      const verif = item.verificacion as Record<string, unknown> | null;
      if (verif) {
        expect(verif).not.toHaveProperty("hallazgo");
        expect(verif).not.toHaveProperty("ticket");
      }
    }
  });

  it("las queries Prisma están filtradas por tenantId + installationId", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    tipoFindMany.mockResolvedValue([
      {
        id: "tipo-1",
        codigo: "reglamento",
        nombre: "Reglamento interno",
        descripcion: null,
        capa: "instalacion",
        obligatorio: true,
        normativa: null,
      },
    ]);
    verifFindMany.mockResolvedValue([]);

    const { GET } = await import(
      "../instalaciones/[id]/docs-fisicos/route"
    );
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/docs-fisicos",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );

    expect(tipoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          isActive: true,
          capa: { in: ["global", "instalacion"] },
        }),
      }),
    );
    expect(verifFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          installationId: "inst-1",
          tipoDocId: { in: ["tipo-1"] },
        }),
        distinct: ["tipoDocId"],
      }),
    );
  });

  it("devuelve lista vacía cuando no hay tipos configurados", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    tipoFindMany.mockResolvedValue([]);

    const { GET } = await import(
      "../instalaciones/[id]/docs-fisicos/route"
    );
    const res = await GET(
      makeRequest(
        "http://x/api/portal/cliente/instalaciones/inst-1/docs-fisicos",
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "inst-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(body.data.resumen).toEqual({
      total: 0,
      presentes: 0,
      ausentes: 0,
      sinVerificar: 0,
    });
    expect(verifFindMany).not.toHaveBeenCalled();
  });
});
