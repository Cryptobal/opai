/**
 * Tests de seguridad multi-tenant para los endpoints de access-control del portal cliente.
 *
 * Cubren la regresión de PR1 — hardening:
 *  - 403 cuando `installationId` pertenece a otra cuenta/tenant.
 *  - PUT de whitelist rechaza entradas de otra instalación aun con URL válida.
 *  - 401 cuando no hay sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirstInstallation = vi.fn();
const findFirstContact = vi.fn();
const findFirstWhitelist = vi.fn();
const updateWhitelist = vi.fn();

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
        installations: [{ id: "inst-own", name: "Own" }],
      });
    }
    return null;
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmInstallation: { findFirst: findFirstInstallation },
    crmContact: { findUnique: findFirstContact },
    accessControlList: {
      findFirst: findFirstWhitelist,
      update: updateWhitelist,
      findMany: vi.fn(() => Promise.resolve([])),
    },
    portalClienteAuditLog: { create: vi.fn() },
  },
}));

// Validador RUT para la ruta whitelist (evitar el import real)
vi.mock("@/lib/access-control/utils", () => ({
  validateRut: () => true,
  cleanRut: (r: string) => r,
}));

// Simula un request básico
function makeRequest(url: string): unknown {
  const u = new URL(url);
  const nextUrl = {
    searchParams: u.searchParams,
  };
  return {
    url,
    nextUrl,
    headers: new Map<string, string>(),
  };
}

// Contacto estándar que devuelve la auth
beforeEach(() => {
  findFirstInstallation.mockReset();
  findFirstContact.mockReset();
  findFirstWhitelist.mockReset();
  updateWhitelist.mockReset();

  findFirstContact.mockResolvedValue({
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
      installations: [{ id: "inst-own" }],
    },
  });
});

describe("GET /api/portal/cliente/access-control/[installationId]/live", () => {
  it("devuelve 401 cuando no hay sesión", async () => {
    // Forzamos cookie null (verifyCookie no reconoce)
    const { GET } = await import(
      "../access-control/[installationId]/live/route"
    );
    // Sobreescribe cookies() para retornar vacío
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });

    const req = makeRequest(
      "http://x/api/portal/cliente/access-control/inst-own/live",
    );
    const res = await GET(req as Parameters<typeof GET>[0], {
      params: Promise.resolve({ installationId: "inst-own" }),
    });
    expect(res.status).toBe(401);
  });

  it("devuelve 403 cuando la instalación no pertenece a la cuenta (cross-tenant)", async () => {
    // La auth pasa, pero ensureInstallationAccess no encuentra la instalación.
    findFirstInstallation.mockResolvedValue(null);

    const { GET } = await import(
      "../access-control/[installationId]/live/route"
    );
    const req = makeRequest(
      "http://x/api/portal/cliente/access-control/inst-otro-tenant/live",
    );
    const res = await GET(req as Parameters<typeof GET>[0], {
      params: Promise.resolve({ installationId: "inst-otro-tenant" }),
    });
    expect(res.status).toBe(403);

    // La validación de acceso debe consultar por id+accountId+tenantId (no solo por id).
    expect(findFirstInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "inst-otro-tenant",
          accountId: "acc-A",
          tenantId: "tenant-A",
        }),
      }),
    );
  });
});

describe("PUT /api/portal/cliente/access-control/[installationId]/whitelist/[id]", () => {
  it("rechaza con 404 si la entrada pertenece a otra instalación del mismo cliente", async () => {
    // Autorización de la instalación OK...
    findFirstInstallation.mockResolvedValue({ id: "inst-own" });
    // ...pero la entrada whitelist no existe bajo (inst-own, tenant-A, whitelist).
    findFirstWhitelist.mockResolvedValue(null);

    const { PUT } = await import(
      "../access-control/[installationId]/whitelist/[id]/route"
    );
    const req = {
      url: "http://x/api/portal/cliente/access-control/inst-own/whitelist/entry-de-otra-inst",
      headers: new Map<string, string>(),
      json: async () => ({ fullName: "X", isActive: true }),
    };
    const res = await PUT(req as unknown as Parameters<typeof PUT>[0], {
      params: Promise.resolve({
        installationId: "inst-own",
        id: "entry-de-otra-inst",
      }),
    });
    expect(res.status).toBe(404);

    // La búsqueda debe incluir installationId + tenantId + listType:'whitelist'.
    expect(findFirstWhitelist).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "entry-de-otra-inst",
          installationId: "inst-own",
          tenantId: "tenant-A",
          listType: "whitelist",
        }),
      }),
    );
    expect(updateWhitelist).not.toHaveBeenCalled();
  });

  it("actualiza cuando la entrada existe y es whitelist de la misma instalación", async () => {
    findFirstInstallation.mockResolvedValue({ id: "inst-own" });
    findFirstWhitelist.mockResolvedValue({ id: "entry-own" });
    updateWhitelist.mockResolvedValue({ id: "entry-own", isActive: true });

    const { PUT } = await import(
      "../access-control/[installationId]/whitelist/[id]/route"
    );
    const req = {
      url: "http://x/api/portal/cliente/access-control/inst-own/whitelist/entry-own",
      headers: new Map<string, string>(),
      json: async () => ({ fullName: "Valid", isActive: true }),
    };
    const res = await PUT(req as unknown as Parameters<typeof PUT>[0], {
      params: Promise.resolve({
        installationId: "inst-own",
        id: "entry-own",
      }),
    });
    expect(res.status).toBe(200);
    expect(updateWhitelist).toHaveBeenCalledOnce();
  });
});
