/**
 * Tests de `/api/portal/cliente/summary` (PR8).
 *
 * Cubre:
 *  - 401 sin sesión.
 *  - 403 sin acceso a la instalación.
 *  - `alerts` y `alertsTrend` quedan en 0 (el cliente no ve alertas operativas).
 *  - Cálculo de `attentionCount`, `missedRounds`, `incompleteRounds`.
 *  - `lastRound` incluye status + guardia saneado.
 *  - `team` resume OS-10 vigente/por_vencer/vencido.
 *  - `openTickets` cuenta solo tickets `portal_cliente` con status open/in_progress.
 *  - Queries Prisma filtradas por tenantId + installationId autorizados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rondaFindMany = vi.fn();
const rondaFindFirst = vi.fn();
const ticketCount = vi.fn();
const guardiaFindMany = vi.fn();
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
    opsRondaEjecucion: { findMany: rondaFindMany, findFirst: rondaFindFirst },
    opsTicket: { count: ticketCount },
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
  rondaFindMany.mockReset();
  rondaFindFirst.mockReset();
  ticketCount.mockReset();
  guardiaFindMany.mockReset();
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

describe("GET /api/portal/cliente/summary", () => {
  it("401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    const { GET } = await import("../summary/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/summary?installationId=inst-1") as Parameters<
        typeof GET
      >[0],
    );
    expect(res.status).toBe(401);
  });

  it("403 sin acceso a la instalación", async () => {
    const { GET } = await import("../summary/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/summary?installationId=inst-otra") as Parameters<
        typeof GET
      >[0],
    );
    expect(res.status).toBe(403);
    expect(rondaFindMany).not.toHaveBeenCalled();
  });

  it("devuelve KPIs nuevos (attentionCount, lastRound, team, openTickets) con alerts en 0", async () => {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(now.getFullYear() + 1);
    const soon = new Date();
    soon.setDate(soon.getDate() + 10);

    // Mes actual: 10 completadas, 2 incompletas, 3 no_realizadas, trust avg 85.
    rondaFindMany.mockResolvedValueOnce([
      ...Array.from({ length: 10 }, () => ({ status: "completada", trustScore: 90 })),
      ...Array.from({ length: 2 }, () => ({ status: "incompleta", trustScore: 70 })),
      ...Array.from({ length: 3 }, () => ({ status: "no_realizada", trustScore: 0 })),
    ]);
    // Mes previo: 20 completadas, trust 80
    rondaFindMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, () => ({ status: "completada", trustScore: 80 })),
    );

    rondaFindFirst.mockResolvedValue({
      id: "r-last",
      status: "completada",
      completedAt: new Date("2026-04-22T10:00:00Z"),
      scheduledAt: new Date("2026-04-22T09:30:00Z"),
      porcentajeCompletado: 100,
      guardia: { persona: { firstName: "Juan", lastName: "Pérez" } },
    });
    ticketCount.mockResolvedValue(3);
    guardiaFindMany.mockResolvedValue([
      { os10: true, os10ExpiresAt: futureDate }, // vigente
      { os10: true, os10ExpiresAt: futureDate }, // vigente
      { os10: true, os10ExpiresAt: soon }, // por_vencer
      { os10: false, os10ExpiresAt: null }, // vencido (vía os10=false)
      { os10: null, os10ExpiresAt: null }, // pendiente
    ]);

    const { GET } = await import("../summary/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/summary?installationId=inst-1") as Parameters<
        typeof GET
      >[0],
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const d = body.data;
    expect(d.alerts).toBe(0);
    expect(d.alertsTrend).toBe(0);
    expect(d.completedRounds).toBe(10);
    expect(d.totalRounds).toBe(15);
    expect(d.missedRounds).toBe(3);
    expect(d.incompleteRounds).toBe(2);
    expect(d.attentionCount).toBe(5);
    expect(d.openTickets).toBe(3);

    expect(d.lastRound).toMatchObject({
      id: "r-last",
      status: "completada",
      porcentaje: 100,
    });
    expect(d.lastRound.guardiaName).toMatch(/Juan/); // saneado

    expect(d.team).toEqual({
      size: 5,
      os10Vigente: 2,
      os10PorVencer: 1,
      os10Vencido: 2, // false + pendiente
    });
  });

  it("queries Prisma filtran por tenantId + installationId", async () => {
    rondaFindMany.mockResolvedValue([]);
    rondaFindFirst.mockResolvedValue(null);
    ticketCount.mockResolvedValue(0);
    guardiaFindMany.mockResolvedValue([]);

    const { GET } = await import("../summary/route");
    await GET(
      makeRequest("http://x/api/portal/cliente/summary?installationId=inst-1") as Parameters<
        typeof GET
      >[0],
    );

    for (const call of rondaFindMany.mock.calls) {
      expect(call[0].where).toMatchObject({
        tenantId: "tenant-A",
        installationId: "inst-1",
      });
    }
    expect(ticketCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          installationId: "inst-1",
          source: "portal_cliente",
          status: { in: ["open", "in_progress"] },
        }),
      }),
    );
    expect(guardiaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          currentInstallationId: "inst-1",
          status: "active",
        }),
      }),
    );
  });

  it("sin rondas: compliance y trust son 0, lastRound es null, team vacío", async () => {
    rondaFindMany.mockResolvedValue([]);
    rondaFindFirst.mockResolvedValue(null);
    ticketCount.mockResolvedValue(0);
    guardiaFindMany.mockResolvedValue([]);

    const { GET } = await import("../summary/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/summary?installationId=inst-1") as Parameters<
        typeof GET
      >[0],
    );
    const body = await res.json();
    expect(body.data).toMatchObject({
      compliance: 0,
      trustScore: 0,
      completedRounds: 0,
      totalRounds: 0,
      missedRounds: 0,
      incompleteRounds: 0,
      attentionCount: 0,
      openTickets: 0,
      lastRound: null,
      team: { size: 0, os10Vigente: 0, os10PorVencer: 0, os10Vencido: 0 },
    });
  });
});
