/**
 * Tests de getCorreoDetail — path degradado (B3): si Gmail falla, el hilo se
 * devuelve con degraded=true y evento Sentry, no una lista de adjuntos vacía
 * silenciosa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  threadFindFirst: vi.fn(),
  threadUpdate: vi.fn(),
  accountFindUnique: vi.fn(),
  messagesFindMany: vi.fn(),
  crmAccountFindFirst: vi.fn(),
  crmDealFindFirst: vi.fn(),
  gmailClientForAccount: vi.fn(),
  hydrateMissingThreadMessages: vi.fn(),
  captureEmailError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: mocks.threadFindFirst, update: mocks.threadUpdate },
    crmEmailAccount: { findUnique: mocks.accountFindUnique },
    crmEmailMessage: { findMany: mocks.messagesFindMany },
    crmAccount: { findFirst: mocks.crmAccountFindFirst },
    crmDeal: { findFirst: mocks.crmDealFindFirst },
  },
}));
vi.mock("../gmail-account-client", () => ({
  gmailClientForAccount: mocks.gmailClientForAccount,
}));
vi.mock("../correos-detail-hydrate", () => ({
  hydrateMissingThreadMessages: mocks.hydrateMissingThreadMessages,
}));
vi.mock("../email-observability", () => ({
  captureEmailError: mocks.captureEmailError,
}));

import { getCorreoDetail } from "../correos-detail";

const THREAD = {
  id: "thr-1",
  subject: "Cotización",
  accountId: null,
  dealId: null,
  leadId: null,
  providerThreadId: "prov-1",
  isUnread: false,
  archivedAt: null,
  starredAt: null,
  spamAt: null,
  // Caché C18 frío por default: fuerza el path remoto en estos tests.
  attachmentsMeta: null,
  detailCachedAt: null,
  updatedAt: new Date("2026-07-21T12:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.threadFindFirst.mockResolvedValue(THREAD);
  mocks.threadUpdate.mockResolvedValue(THREAD);
  mocks.accountFindUnique.mockResolvedValue({
    email: "casilla@gmail.com",
    userId: "user-1",
    accessTokenEncrypted: "x",
    refreshTokenEncrypted: "y",
  });
  mocks.messagesFindMany.mockResolvedValue([]);
  mocks.hydrateMissingThreadMessages.mockResolvedValue(undefined);
});

describe("getCorreoDetail — path degradado (B3)", () => {
  it("si Gmail falla retorna degraded=true y reporta a Sentry", async () => {
    mocks.gmailClientForAccount.mockReturnValue({
      users: {
        threads: {
          get: vi.fn().mockRejectedValue(new Error("gmail 500")),
        },
      },
    });

    const detail = await getCorreoDetail({
      tenantId: "tenant-1",
      emailAccountId: "acc-1",
      threadId: "thr-1",
    });

    expect(detail).not.toBeNull();
    expect(detail!.degraded).toBe(true);
    expect(detail!.attachments).toEqual([]);
    expect(mocks.captureEmailError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        scope: "detalle-hilo",
        tenantId: "tenant-1",
        emailAccountId: "acc-1",
        threadId: "thr-1",
      }),
    );
  });

  it("con Gmail OK retorna degraded=false", async () => {
    mocks.gmailClientForAccount.mockReturnValue({
      users: {
        threads: {
          get: vi.fn().mockResolvedValue({ data: { messages: [] } }),
        },
      },
    });

    const detail = await getCorreoDetail({
      tenantId: "tenant-1",
      emailAccountId: "acc-1",
      threadId: "thr-1",
    });

    expect(detail!.degraded).toBe(false);
    expect(mocks.captureEmailError).not.toHaveBeenCalled();
  });

  it("sin cliente Gmail (casilla sin tokens) no marca degradado", async () => {
    mocks.gmailClientForAccount.mockReturnValue(null);
    const detail = await getCorreoDetail({
      tenantId: "tenant-1",
      emailAccountId: "acc-1",
      threadId: "thr-1",
    });
    expect(detail!.degraded).toBe(false);
  });
});

describe("getCorreoDetail — caché de detalle (C18)", () => {
  it("caché fresco sirve 100% local: cero llamadas a Gmail", async () => {
    const now = new Date();
    mocks.threadFindFirst.mockResolvedValue({
      ...THREAD,
      attachmentsMeta: [
        { messageId: "m1", attachmentId: "a1", filename: "f.pdf", mimeType: "application/pdf", size: 10 },
      ],
      detailCachedAt: now,
      updatedAt: now,
    });
    const detail = await getCorreoDetail({
      tenantId: "tenant-1",
      emailAccountId: "acc-1",
      threadId: "thr-1",
    });
    expect(mocks.gmailClientForAccount).not.toHaveBeenCalled();
    expect(detail!.attachments).toHaveLength(1);
    expect(detail!.degraded).toBe(false);
  });

  it("el sync que toca el hilo (updatedAt > detailCachedAt) invalida el caché", async () => {
    const cachedAt = new Date(Date.now() - 60_000);
    mocks.threadFindFirst.mockResolvedValue({
      ...THREAD,
      attachmentsMeta: [],
      detailCachedAt: cachedAt,
      updatedAt: new Date(), // el sync escribió después del cacheo
    });
    const get = vi.fn().mockResolvedValue({ data: { messages: [] } });
    mocks.gmailClientForAccount.mockReturnValue({ users: { threads: { get } } });
    await getCorreoDetail({
      tenantId: "tenant-1",
      emailAccountId: "acc-1",
      threadId: "thr-1",
    });
    expect(get).toHaveBeenCalled();
    expect(mocks.threadUpdate).toHaveBeenCalled();
  });

  it("en fallo remoto con caché viejo, degrada usando el caché (no lista vacía)", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      ...THREAD,
      attachmentsMeta: [
        { messageId: "m1", attachmentId: "a1", filename: "f.pdf", mimeType: "application/pdf", size: 10 },
      ],
      detailCachedAt: new Date(Date.now() - 60 * 60_000), // TTL vencido
      updatedAt: new Date(Date.now() - 60 * 60_000),
    });
    mocks.gmailClientForAccount.mockReturnValue({
      users: { threads: { get: vi.fn().mockRejectedValue(new Error("boom")) } },
    });
    const detail = await getCorreoDetail({
      tenantId: "tenant-1",
      emailAccountId: "acc-1",
      threadId: "thr-1",
    });
    expect(detail!.degraded).toBe(true);
    expect(detail!.attachments).toHaveLength(1);
  });
});
