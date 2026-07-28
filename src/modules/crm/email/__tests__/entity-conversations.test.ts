import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePermissions } from "@/lib/permissions";
import {
  legacyParamsToEntity,
  resolveEntityConversations,
} from "../entity-conversations";

function perms(opts?: {
  modules?: RolePermissions["modules"];
  submodules?: RolePermissions["submodules"];
}): RolePermissions {
  return {
    modules: { crm: "view", ops: "view", ...(opts?.modules ?? {}) },
    submodules: {
      "crm.accounts": "view",
      "crm.contacts": "view",
      "crm.deals": "view",
      "crm.quotes": "view",
      "crm.installations": "view",
      ...(opts?.submodules ?? {}),
    },
    capabilities: {},
  };
}

describe("legacyParamsToEntity", () => {
  it("traduce parámetros antiguos", () => {
    expect(
      legacyParamsToEntity({
        accountId: "a1",
        dealId: null,
        installationId: null,
        entityType: null,
        entityId: null,
      }),
    ).toEqual({ entityType: "account", entityId: "a1" });
  });
});

describe("resolveEntityConversations", () => {
  const prisma = {
    crmAccount: { findFirst: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    crmDeal: { findFirst: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
    cpqQuote: { findFirst: vi.fn() },
    crmEmailThread: { findMany: vi.fn() },
    crmEmailThreadContact: { findMany: vi.fn() },
    crmEmailThreadLink: { findMany: vi.fn() },
    crmDealQuote: { findMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("account: 404 si la entidad es de otro tenant", async () => {
    prisma.crmAccount.findFirst.mockResolvedValue(null);
    const result = await resolveEntityConversations({
      prisma: prisma as never,
      tenantId: "t1",
      perms: perms(),
      entityType: "account",
      entityId: "other",
      cascade: true,
    });
    expect(result).toEqual({ ok: false, status: 404, error: "Cuenta no encontrada" });
  });

  it("account: no incluye hilos privados (sharedWithAccount filter)", async () => {
    prisma.crmAccount.findFirst.mockResolvedValue({ id: "a1" });
    prisma.crmEmailThread.findMany
      .mockResolvedValueOnce([{ id: "th1" }])
      .mockResolvedValueOnce([
        {
          id: "th1",
          subject: "Hola",
          lastMessageAt: new Date("2026-01-01"),
          messages: [{ fromEmail: "a@b.cl" }],
        },
      ]);

    const result = await resolveEntityConversations({
      prisma: prisma as never,
      tenantId: "t1",
      perms: perms(),
      entityType: "account",
      entityId: "a1",
      cascade: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].origin).toBe("direct");
    }
    expect(prisma.crmEmailThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sharedWithAccount: true }),
      }),
    );
  });

  it("quote: gate sin permiso", async () => {
    const result = await resolveEntityConversations({
      prisma: prisma as never,
      tenantId: "t1",
      perms: perms({
        modules: { crm: "none" },
        submodules: { "crm.quotes": "none" },
      }),
      entityType: "quote",
      entityId: "q1",
      cascade: true,
    });
    expect(result).toEqual({ ok: false, status: 403, error: "Sin acceso a la cotización" });
  });

  it("deduplica preferiendo direct sobre inherited", async () => {
    prisma.crmDeal.findFirst.mockResolvedValue({ id: "d1", accountId: "a1" });
    prisma.crmDealQuote.findMany.mockResolvedValue([]);
    prisma.crmEmailThread.findMany
      .mockResolvedValueOnce([{ id: "th1" }])
      .mockResolvedValueOnce([{ id: "th1" }, { id: "th2" }])
      .mockResolvedValueOnce([
        {
          id: "th1",
          subject: "Directo",
          lastMessageAt: new Date("2026-02-01"),
          messages: [{ fromEmail: "x@y.cl" }],
        },
        {
          id: "th2",
          subject: "Heredado",
          lastMessageAt: new Date("2026-01-01"),
          messages: [{ fromEmail: "z@y.cl" }],
        },
      ]);

    const result = await resolveEntityConversations({
      prisma: prisma as never,
      tenantId: "t1",
      perms: perms(),
      entityType: "deal",
      entityId: "d1",
      cascade: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const th1 = result.threads.find((t) => t.id === "th1");
      expect(th1?.origin).toBe("direct");
      const th2 = result.threads.find((t) => t.id === "th2");
      expect(th2?.origin).toBe("inherited");
    }
  });
});
