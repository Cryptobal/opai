/**
 * Tests del endpoint /api/portal/cliente/notificaciones (PR2).
 *
 * Garantiza que:
 *  1. El cliente NO recibe alertas operativas crudas (velocidad, pánico,
 *     batería, guardia estático, genérica) — ésas son para el equipo
 *     interno, no para el cliente.
 *  2. El feed se construye a partir de rondas (completada / incompleta /
 *     no_realizada) y tickets respondidos, con los tipos cliente-friendly.
 *  3. Las consultas a Prisma están filtradas por tenantId + installationId
 *     del contacto autenticado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rondaFindMany = vi.fn();
const ticketFindMany = vi.fn();
const contactFindUnique = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "portal_cliente_session" ? { value: "fake-signed-cookie" } : undefined,
  })),
}));
vi.mock("@/lib/cookie-signature", () => ({
  verifyCookie: vi.fn((raw: string) => {
    if (raw === "fake-signed-cookie") {
      return JSON.stringify({
        contactId: "contact-1",
        tenantId: "tenant-A",
        accountId: "acc-A",
        installations: [{ id: "inst-1", name: "Sede" }],
      });
    }
    return null;
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: { findUnique: contactFindUnique },
    opsRondaEjecucion: { findMany: rondaFindMany },
    opsTicket: { findMany: ticketFindMany },
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
  rondaFindMany.mockReset();
  ticketFindMany.mockReset();
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

describe("GET /api/portal/cliente/notificaciones — feed cliente-friendly", () => {
  it("devuelve 401 sin sesión válida", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });

    const { GET } = await import("../notificaciones/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/notificaciones") as Parameters<typeof GET>[0],
    );
    expect(res.status).toBe(401);
  });

  it("devuelve lista vacía si el cliente no tiene instalaciones", async () => {
    contactFindUnique.mockResolvedValue({
      id: "contact-1",
      tenantId: "tenant-A",
      accountId: "acc-A",
      firstName: "Ana",
      lastName: "Cliente",
      email: "ana@acme.cl",
      portalEnabled: true,
      account: { status: "client_active", isActive: true, installations: [] },
    });

    const { GET } = await import("../notificaciones/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/notificaciones") as Parameters<typeof GET>[0],
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(rondaFindMany).not.toHaveBeenCalled();
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  it("construye el feed SOLO desde rondas + tickets (nunca OpsAlertaRonda)", async () => {
    rondaFindMany.mockResolvedValue([
      {
        id: "r1",
        status: "completada",
        scheduledAt: new Date("2026-04-22T02:00:00Z"),
        completedAt: new Date("2026-04-22T02:35:00Z"),
        checkpointsTotal: 10,
        checkpointsCompletados: 10,
        porcentajeCompletado: 100,
      },
      {
        id: "r2",
        status: "incompleta",
        scheduledAt: new Date("2026-04-22T04:00:00Z"),
        completedAt: new Date("2026-04-22T04:20:00Z"),
        checkpointsTotal: 10,
        checkpointsCompletados: 6,
        porcentajeCompletado: 60,
      },
      {
        id: "r3",
        status: "no_realizada",
        scheduledAt: new Date("2026-04-22T06:00:00Z"),
        completedAt: null,
        checkpointsTotal: 10,
        checkpointsCompletados: 0,
        porcentajeCompletado: 0,
      },
    ]);
    ticketFindMany.mockResolvedValue([
      {
        id: "t1",
        title: "Consulta sobre dotación",
        status: "resolved",
        updatedAt: new Date("2026-04-21T10:00:00Z"),
      },
    ]);

    const { GET } = await import("../notificaciones/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/notificaciones") as Parameters<typeof GET>[0],
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const types = body.data.map((n: { type: string }) => n.type).sort();
    expect(types).toEqual([
      "ronda_completada",
      "ronda_incompleta",
      "ronda_no_realizada",
      "ticket_respondido",
    ]);

    // Ninguna alerta operativa cruda presente.
    for (const blocked of [
      "alerta_velocidad",
      "alerta_panico",
      "alerta_bateria",
      "alerta_guardia_estatico",
      "alerta_generica",
    ]) {
      expect(types).not.toContain(blocked);
    }

    // Rondas incompletas/no_realizadas se marcan isRead:false (destacadas).
    const byType = Object.fromEntries(
      body.data.map((n: { type: string; isRead: boolean }) => [n.type, n.isRead]),
    );
    expect(byType.ronda_incompleta).toBe(false);
    expect(byType.ronda_no_realizada).toBe(false);
    expect(byType.ronda_completada).toBe(true);
  });

  it("filtra rondas y tickets por tenantId + installationIds autorizados", async () => {
    rondaFindMany.mockResolvedValue([]);
    ticketFindMany.mockResolvedValue([]);

    const { GET } = await import("../notificaciones/route");
    await GET(
      makeRequest("http://x/api/portal/cliente/notificaciones") as Parameters<typeof GET>[0],
    );

    expect(rondaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          installationId: { in: ["inst-1"] },
          status: { in: ["completada", "incompleta", "no_realizada"] },
        }),
      }),
    );
    expect(ticketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          installationId: { in: ["inst-1"] },
          source: "portal_cliente",
        }),
      }),
    );
  });
});

describe("CLIENT_NOTIFICATION_TYPES / CLIENT_BLOCKED_NOTIFICATION_TYPES", () => {
  it("los tipos expuestos y bloqueados no se solapan", async () => {
    const mod = await import("../notificaciones/route");
    const exposed = new Set<string>(mod.CLIENT_NOTIFICATION_TYPES);
    for (const blocked of mod.CLIENT_BLOCKED_NOTIFICATION_TYPES) {
      expect(exposed.has(blocked)).toBe(false);
    }
  });
});
