/**
 * Verifica el hardening PR2 de `/api/portal/cliente/alertas/config`:
 *  - `CLIENT_ALERT_TYPES` no incluye tipos operativos internos
 *    (guard_absent, checkpoint_missed, incident, ronda_incomplete).
 *  - GET solo devuelve las claves cliente-friendly + defaults.
 *  - PUT descarta silenciosamente inputs con tipos bloqueados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const configFindMany = vi.fn();
const configFindFirst = vi.fn();
const configUpdate = vi.fn();
const configCreate = vi.fn();
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
    portalClienteAlertConfig: {
      findMany: configFindMany,
      findFirst: configFindFirst,
      update: configUpdate,
      create: configCreate,
    },
  },
}));

function makeRequest(url: string, body?: unknown): unknown {
  const u = new URL(url);
  return {
    url,
    nextUrl: { searchParams: u.searchParams },
    headers: new Map<string, string>(),
    json: async () => body,
  };
}

beforeEach(() => {
  configFindMany.mockReset();
  configFindFirst.mockReset();
  configUpdate.mockReset();
  configCreate.mockReset();
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

describe("CLIENT_ALERT_TYPES", () => {
  it("no incluye tipos operativos internos", async () => {
    const mod = await import("../alertas/config/route");
    const exposed = new Set<string>(mod.CLIENT_ALERT_TYPES);
    for (const blocked of mod.LEGACY_OPERATIONAL_ALERT_TYPES) {
      expect(exposed.has(blocked)).toBe(false);
    }
    // Smoke test del contenido esperado
    expect(exposed.has("ronda_no_realizada")).toBe(true);
    expect(exposed.has("ronda_incompleta")).toBe(true);
    expect(exposed.has("new_document")).toBe(true);
    expect(exposed.has("ticket_replied")).toBe(true);
  });
});

describe("GET /api/portal/cliente/alertas/config", () => {
  it("solo devuelve tipos cliente-friendly con defaults si faltan", async () => {
    configFindMany.mockResolvedValue([
      {
        id: "cfg-1",
        alertType: "ronda_no_realizada",
        channels: { push: true, email: true },
        isActive: true,
      },
    ]);

    const { GET, CLIENT_ALERT_TYPES } = await import("../alertas/config/route");
    const res = await GET(
      makeRequest("http://x/api/portal/cliente/alertas/config") as Parameters<typeof GET>[0],
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    const returnedTypes = body.data.map((d: { alertType: string }) => d.alertType).sort();
    expect(returnedTypes).toEqual([...CLIENT_ALERT_TYPES].sort());

    // Prisma query debe filtrar por alertType in CLIENT_ALERT_TYPES.
    expect(configFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          contactId: "contact-1",
          alertType: { in: expect.any(Array) },
        }),
      }),
    );
    const whereArg = configFindMany.mock.calls[0][0].where;
    for (const legacy of [
      "guard_absent",
      "checkpoint_missed",
      "incident",
      "ronda_incomplete",
    ]) {
      expect(whereArg.alertType.in).not.toContain(legacy);
    }
  });
});

describe("PUT /api/portal/cliente/alertas/config", () => {
  it("descarta inputs con tipos legacy/operativos", async () => {
    const { PUT } = await import("../alertas/config/route");
    const res = await PUT(
      makeRequest(
        "http://x/api/portal/cliente/alertas/config",
        [
          { alertType: "guard_absent", channels: { push: true, email: true }, isActive: true },
          { alertType: "checkpoint_missed", channels: { push: true, email: true }, isActive: true },
          { alertType: "incident", channels: { push: true, email: true }, isActive: true },
        ],
      ) as Parameters<typeof PUT>[0],
    );
    expect(res.status).toBe(200);
    // Ninguno de los legacy se persiste.
    expect(configCreate).not.toHaveBeenCalled();
    expect(configUpdate).not.toHaveBeenCalled();
    expect(configFindFirst).not.toHaveBeenCalled();
  });

  it("acepta y upserta tipos cliente-friendly", async () => {
    configFindFirst.mockResolvedValue(null);
    configCreate.mockImplementation(async ({ data }) => ({
      id: "new",
      ...data,
    }));

    const { PUT } = await import("../alertas/config/route");
    const res = await PUT(
      makeRequest(
        "http://x/api/portal/cliente/alertas/config",
        [
          { alertType: "ronda_no_realizada", channels: { push: true, email: false }, isActive: true },
        ],
      ) as Parameters<typeof PUT>[0],
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(configCreate).toHaveBeenCalledOnce();
    expect(configCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-A",
          contactId: "contact-1",
          accountId: "acc-A",
          alertType: "ronda_no_realizada",
          isActive: true,
        }),
      }),
    );
  });
});
