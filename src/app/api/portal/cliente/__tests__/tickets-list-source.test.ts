/**
 * Test de seguridad para `GET /api/portal/cliente/tickets` (fix post-PR5).
 *
 * El cliente NUNCA debe ver tickets internos (supervisión, guard events,
 * operaciones manuales, etc). El listado debe forzar
 * `source: "portal_cliente"` en la query Prisma.
 *
 * Bug reportado (regresión): la pantalla de Tickets mostraba hallazgos
 * críticos de supervisión porque el filtro de source no estaba aplicado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ticketFindMany = vi.fn();
const installationFindFirst = vi.fn();
const installationFindMany = vi.fn();
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
    crmInstallation: {
      findFirst: installationFindFirst,
      findMany: installationFindMany,
    },
    opsTicket: { findMany: ticketFindMany },
  },
}));
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({}) } },
  getTenantEmailConfig: vi.fn().mockResolvedValue({
    from: "x",
    logoUrl: null,
    companyName: "X",
  }),
}));
vi.mock("@/lib/notifications/notify", () => ({
  notify: vi.fn().mockResolvedValue({ delivered: 0 }),
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
  ticketFindMany.mockReset();
  installationFindFirst.mockReset();
  installationFindMany.mockReset();
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

describe("GET /api/portal/cliente/tickets — filtro source", () => {
  it("fuerza `source: portal_cliente` en el where de Prisma (sin installationId)", async () => {
    installationFindMany.mockResolvedValue([{ id: "inst-1" }]);
    ticketFindMany.mockResolvedValue([]);

    const { GET } = await import("../tickets/route");
    await GET(
      makeRequest("http://x/api/portal/cliente/tickets") as Parameters<typeof GET>[0],
    );

    expect(ticketFindMany).toHaveBeenCalledOnce();
    const whereArg = ticketFindMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      tenantId: "tenant-A",
      installationId: { in: ["inst-1"] },
      source: "portal_cliente",
    });
  });

  it("fuerza `source: portal_cliente` incluso con installationId filtro", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    ticketFindMany.mockResolvedValue([]);

    const { GET } = await import("../tickets/route");
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/tickets?installationId=inst-1&status=open",
      ) as Parameters<typeof GET>[0],
    );

    const whereArg = ticketFindMany.mock.calls[0][0].where;
    expect(whereArg.source).toBe("portal_cliente");
    expect(whereArg.status).toBe("open");
  });

  it("aunque la DB tuviera tickets internos de la misma instalación, no los devolvería (Prisma los filtra)", async () => {
    // Este test simula que Prisma ya respetó el filtro. El objetivo es que
    // el payload jamás contenga objetos cuyo `source` sea distinto de
    // 'portal_cliente'.
    installationFindMany.mockResolvedValue([{ id: "inst-1" }]);
    ticketFindMany.mockResolvedValue([
      {
        id: "t1",
        code: "TKT-CLIENT",
        status: "open",
        priority: "p3",
        title: "Cliente reportó algo",
        description: null,
        assignedTeam: "operaciones",
        installationId: "inst-1",
        source: "portal_cliente",
        slaDueAt: null,
        resolvedAt: null,
        closedAt: null,
        tags: [],
        createdAt: new Date(),
        ticketType: null,
      },
    ]);

    const { GET } = await import("../tickets/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/tickets") as Parameters<typeof GET>[0],
    );
    const body = await res.json();
    for (const t of body.data) {
      expect(t.source).toBe("portal_cliente");
    }
  });
});
