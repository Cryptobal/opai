import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GMAIL_MODIFY_SCOPE } from "@/lib/gmail";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireCorreosAccess: vi.fn(),
  requireThreadMailbox: vi.fn(),
  runAction: vi.fn(),
  broadcast: vi.fn(),
  invalidateCounts: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-auth-productividad", () => ({
  requireCorreosAccess: mocks.requireCorreosAccess,
}));
vi.mock("@/modules/crm/email/mailbox-scope", () => ({
  requireThreadMailbox: mocks.requireThreadMailbox,
}));
vi.mock("@/modules/crm/email/gmail-thread-actions", () => ({
  runCorreoThreadAction: mocks.runAction,
}));
vi.mock("@/modules/crm/email/gmail-realtime", () => ({
  broadcastGmailMailboxChanged: mocks.broadcast,
}));
vi.mock("@/modules/crm/email/correos-folder-counts", () => ({
  invalidateCorreoFolderCounts: mocks.invalidateCounts,
}));
vi.mock("@/lib/audit-email", () => ({
  auditEmailAction: mocks.audit,
}));

const { POST } = await import("../route");

function request(action = "archive") {
  return new NextRequest("http://localhost/api/crm/correos/thread-1/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

describe("correo thread action account precheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCorreosAccess.mockResolvedValue({ authorized: true });
    mocks.auth.mockResolvedValue({
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        email: "user@example.com",
      },
    });
    mocks.requireThreadMailbox.mockResolvedValue({
      ok: true,
      thread: { id: "thread-1", emailAccountId: "account-owner" },
      account: {
        id: "account-owner",
        email: "user@example.com",
        color: "teal",
        displayLabel: "user",
        isDefault: true,
        sortIndex: 0,
        status: "active",
        grantedScopes: GMAIL_MODIFY_SCOPE,
      },
    });
    mocks.runAction.mockResolvedValue({ ok: true });
    mocks.broadcast.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("valida permisos con la casilla dueña del hilo", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireThreadMailbox).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      threadId: "thread-1",
    });
    expect(mocks.runAction).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-1", action: "archive" }),
    );
  });

  it("no usa otra casilla activa si la dueña no tiene gmail.modify", async () => {
    mocks.requireThreadMailbox.mockResolvedValue({
      ok: true,
      thread: { id: "thread-1", emailAccountId: "account-owner" },
      account: {
        id: "account-owner",
        email: "user@example.com",
        color: "teal",
        displayLabel: "user",
        isDefault: true,
        sortIndex: 0,
        status: "active",
        grantedScopes: "https://www.googleapis.com/auth/gmail.send",
      },
    });

    const response = await POST(request(), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({ needsReconnect: true }),
    );
    expect(mocks.runAction).not.toHaveBeenCalled();
  });
});
