/**
 * Tests de auditEmailAction (C07): escribe en AuditLog con tenant obligatorio,
 * prefija la acción con "email." y nunca lanza si la escritura falla.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const auditCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { create: auditCreate } },
}));

// Import dinámico: el factory de vi.mock se hoistea sobre el vi.fn() de arriba.
const { auditEmailAction } = await import("@/lib/audit-email");

beforeEach(() => {
  auditCreate.mockReset().mockResolvedValue({});
});

describe("auditEmailAction", () => {
  it("escribe la fila con tenantId, acción prefijada y meta mínima", async () => {
    await auditEmailAction({
      tenantId: "tenant-1",
      userId: "user-1",
      userEmail: "u@acme.cl",
      action: "send",
      entityType: "email_message",
      entityId: "msg-1",
      meta: { threadId: "thr-1", attachments: 2 },
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        userId: "user-1",
        userEmail: "u@acme.cl",
        action: "email.send",
        entity: "email_message",
        entityId: "msg-1",
        details: { threadId: "thr-1", attachments: 2 },
      }),
    });
  });

  it("no lanza si la escritura falla (la mutación principal no se interrumpe)", async () => {
    auditCreate.mockRejectedValue(new Error("db down"));
    await expect(
      auditEmailAction({
        tenantId: "tenant-1",
        action: "archive",
        entityType: "email_thread",
        entityId: "thr-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("acciones de casilla quedan con entityType email_account", async () => {
    await auditEmailAction({
      tenantId: "tenant-1",
      userId: "admin-1",
      action: "disconnect_account",
      entityType: "email_account",
      entityId: "acc-1",
      meta: { upstreamRevoked: true },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "email.disconnect_account",
        entity: "email_account",
      }),
    });
  });
});
