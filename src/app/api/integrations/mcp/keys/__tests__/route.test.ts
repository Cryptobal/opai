/**
 * DELETE /api/integrations/mcp/keys — revoke vs purge permanente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireIntegrationAdmin: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/integrations/guard", () => ({
  requireIntegrationAdmin: mocks.requireIntegrationAdmin,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/integrations/mcp/keys", () => ({
  generateMcpKey: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mcpApiKey: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const { DELETE } = await import("../route");

const CTX = { userId: "admin-1", tenantId: "tenant-1", userEmail: "a@x.cl", userRole: "admin" };

function req(qs: string): Request {
  return new Request(`http://x/api/integrations/mcp/keys?${qs}`, { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireIntegrationAdmin.mockResolvedValue({ ctx: CTX });
  mocks.logAudit.mockResolvedValue(undefined);
});

describe("DELETE /api/integrations/mcp/keys", () => {
  it("sin permanent revoca (soft delete) y audita revoked_by_admin", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("id=key-1"));
    expect(res.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "key-1", tenantId: CTX.tenantId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entity: "McpApiKey",
        entityId: "key-1",
        details: { source: "mcp_admin", reason: "revoked_by_admin" },
      }),
    );
  });

  it("permanent=true sobre key activa devuelve 409 y no borra", async () => {
    mocks.findFirst.mockResolvedValue({
      name: "Prod",
      keyPrefix: "opai_mcp_ab",
      scope: "READ",
      createdAt: new Date("2026-01-01"),
      lastUsedAt: null,
      revokedAt: null,
    });
    const res = await DELETE(req("id=key-active&permanent=true"));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("Revoca la key antes de eliminarla.");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("permanent=true sobre key revocada la borra y audita purged_by_admin", async () => {
    const revokedAt = new Date("2026-02-01");
    const createdAt = new Date("2026-01-01");
    mocks.findFirst.mockResolvedValue({
      name: "Vieja",
      keyPrefix: "opai_mcp_xy",
      scope: "READ_WRITE",
      createdAt,
      lastUsedAt: null,
      revokedAt,
    });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("id=key-revoked&permanent=true"));
    expect(res.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "key-revoked", tenantId: CTX.tenantId, revokedAt: { not: null } },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entity: "McpApiKey",
        entityId: "key-revoked",
        details: expect.objectContaining({
          source: "mcp_admin",
          reason: "purged_by_admin",
          name: "Vieja",
          keyPrefix: "opai_mcp_xy",
          scope: "READ_WRITE",
          createdAt,
          lastUsedAt: null,
          revokedAt,
        }),
      }),
    );
  });

  it("permanent=true con id de otro tenant (o inexistente) devuelve 404", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await DELETE(req("id=foreign-key&permanent=true"));
    expect(res.status).toBe(404);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("permanent=true en carrera (deleteMany count 0) devuelve 404", async () => {
    mocks.findFirst.mockResolvedValue({
      name: "Race",
      keyPrefix: "opai_mcp_zz",
      scope: "READ",
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: new Date(),
    });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(req("id=key-race&permanent=true"));
    expect(res.status).toBe(404);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
