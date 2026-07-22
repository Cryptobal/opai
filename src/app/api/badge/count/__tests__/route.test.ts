/**
 * Tests de GET /api/badge/count (PR-15): el badge suma los hilos no leídos
 * del inbox de las casillas del usuario al conteo de chat + campana.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  cursorFindMany: vi.fn(),
  chatPrefFindMany: vi.fn(),
  batchUnreadCounts: vi.fn(),
  computeBellUnreadCount: vi.fn(),
  accountFindMany: vi.fn(),
  threadCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
  unauthorized: () => new Response(null, { status: 401 }),
}));
vi.mock("@/lib/chat", () => ({ batchUnreadCounts: mocks.batchUnreadCounts }));
vi.mock("@/lib/notifications/bell-visibility", () => ({
  computeBellUnreadCount: mocks.computeBellUnreadCount,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatReadCursor: { findMany: mocks.cursorFindMany },
    chatNotificationPreference: { findMany: mocks.chatPrefFindMany },
    crmEmailAccount: { findMany: mocks.accountFindMany },
    crmEmailThread: { count: mocks.threadCount },
  },
}));

const { GET } = await import("../route");

let seq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  // Usuario único por test: la ruta cachea por tenant:user durante 60s.
  seq += 1;
  mocks.requireAuth.mockResolvedValue({
    userId: `user-${seq}`,
    tenantId: "t1",
    userEmail: "u@x.cl",
    userRole: "admin",
  });
  mocks.cursorFindMany.mockResolvedValue([]);
  mocks.chatPrefFindMany.mockResolvedValue([]);
  mocks.batchUnreadCounts.mockResolvedValue(new Map());
  mocks.computeBellUnreadCount.mockResolvedValue(2);
  mocks.accountFindMany.mockResolvedValue([{ id: "acc-1" }]);
  mocks.threadCount.mockResolvedValue(3);
});

describe("GET /api/badge/count", () => {
  it("suma no-leídos de correo al total (chat + campana + correo)", async () => {
    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ chat: 0, bell: 2, correo: 3, total: 5 });
    // Ownership: solo casillas del usuario de sesión.
    expect(mocks.accountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          userId: expect.stringMatching(/^user-/),
          status: "active",
        }),
      }),
    );
    // Inbox no leído: isUnread + sin archivar/papelera/spam.
    expect(mocks.threadCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailAccountId: { in: ["acc-1"] },
          isUnread: true,
          archivedAt: null,
          trashedAt: null,
          spamAt: null,
        }),
      }),
    );
  });

  it("sin casillas conectadas el correo aporta 0", async () => {
    mocks.accountFindMany.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.correo).toBe(0);
    expect(body.total).toBe(2);
    expect(mocks.threadCount).not.toHaveBeenCalled();
  });
});
