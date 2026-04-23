/**
 * Tests de `/api/portal/cliente/rondas` (listado).
 *
 * Cubre la regla de visibilidad para el portal del cliente:
 *  - Por defecto solo se devuelven rondas con status `completada`,
 *    `incompleta` o `en_curso`. Nunca `pendiente`, `no_realizada` ni
 *    `fallida`, porque no aportan contexto al cliente y daban una
 *    sensación incorrecta (rojo) sobre el servicio real.
 *  - `?status=all` permite inspección interna/QA sin romper el filtro
 *    por defecto del cliente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rondaFindMany = vi.fn();
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
    opsRondaEjecucion: { findMany: rondaFindMany },
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
  installationFindFirst.mockResolvedValue({ id: "inst-1" });
  installationFindMany.mockResolvedValue([{ id: "inst-1" }]);
  rondaFindMany.mockResolvedValue([]);
});

describe("GET /api/portal/cliente/rondas — filtro de status por defecto", () => {
  it("por defecto filtra a completada/incompleta/en_curso (sin pendiente/no_realizada/fallida)", async () => {
    const { GET } = await import("../rondas/route");
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/rondas?installationId=inst-1",
      ) as Parameters<typeof GET>[0],
    );

    expect(rondaFindMany).toHaveBeenCalledTimes(1);
    const where = rondaFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({
      in: ["en_curso", "completada", "incompleta"],
    });
  });

  it("con ?status=all no aplica filtro de status (escape hatch para QA interno)", async () => {
    const { GET } = await import("../rondas/route");
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/rondas?installationId=inst-1&status=all",
      ) as Parameters<typeof GET>[0],
    );

    const where = rondaFindMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it("mantiene el scope por tenant + instalación autorizada", async () => {
    const { GET } = await import("../rondas/route");
    await GET(
      makeRequest(
        "http://x/api/portal/cliente/rondas?installationId=inst-1",
      ) as Parameters<typeof GET>[0],
    );

    const where = rondaFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("tenant-A");
    expect(where.OR).toEqual([
      { installationId: { in: ["inst-1"] } },
      { rondaTemplate: { installationId: { in: ["inst-1"] } } },
    ]);
  });
});
