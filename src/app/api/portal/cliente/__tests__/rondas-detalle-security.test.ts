/**
 * Hardening PR2 de `/api/portal/cliente/rondas/[id]`:
 *  - Devuelve 404 uniforme cuando la ronda no pertenece al tenant/cuenta
 *    del cliente (antes distinguía entre 404 y 403, permitiendo enumerar IDs).
 *  - La consulta usa `findFirst` con filtro compuesto tenantId +
 *    installation.accountId + installation.tenantId.
 *  - 401 cuando no hay sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rondaFindFirst = vi.fn();
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
    opsRondaEjecucion: { findFirst: rondaFindFirst },
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
  rondaFindFirst.mockReset();
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

describe("GET /api/portal/cliente/rondas/[id]", () => {
  it("devuelve 401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });

    const { GET } = await import("../rondas/[id]/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r1") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(res.status).toBe(401);
    expect(rondaFindFirst).not.toHaveBeenCalled();
  });

  it("devuelve 404 uniforme cuando la ronda es de otro tenant/cuenta", async () => {
    rondaFindFirst.mockResolvedValue(null);

    const { GET } = await import("../rondas/[id]/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r-ajena") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r-ajena" }) },
    );
    expect(res.status).toBe(404);

    // La consulta debe incluir tenantId y installation.accountId en un único findFirst.
    expect(rondaFindFirst).toHaveBeenCalledWith(
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

  it("devuelve el detalle cuando la ronda pertenece a la cuenta", async () => {
    rondaFindFirst.mockResolvedValue({
      id: "r1",
      tenantId: "tenant-A",
      installationId: "inst-1",
      status: "completada",
      marcaciones: [],
      incidentes: [],
      guardia: null,
    });

    const { GET } = await import("../rondas/[id]/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/rondas/r1") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ id: "r1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("r1");
  });
});
