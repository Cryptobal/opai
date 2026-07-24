import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listGmailThreadIdSet: vi.fn(),
  findMany: vi.fn(),
  upsertGmailMessage: vi.fn(),
  applyThreadLabelFlags: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findMany: mocks.findMany, updateMany: vi.fn() },
  },
}));

vi.mock("../gmail-folder-reconcile-sets", () => ({
  listGmailThreadIdSet: mocks.listGmailThreadIdSet,
}));

vi.mock("../gmail-message-upsert", () => ({
  upsertGmailMessage: mocks.upsertGmailMessage,
}));

vi.mock("../gmail-thread-labels", () => ({
  applyThreadLabelFlags: mocks.applyThreadLabelFlags,
}));

vi.mock("../correos-folder-counts", () => ({
  invalidateCorreoFolderCounts: mocks.invalidate,
}));

import { repairMissingInboxThreads } from "../gmail-folder-reconcile";

describe("repairMissingInboxThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("importa hilos INBOX de Gmail que no existen localmente", async () => {
    mocks.listGmailThreadIdSet.mockResolvedValue({
      ids: new Set(["t-local", "t-missing"]),
      complete: true,
    });
    mocks.findMany.mockResolvedValue([{ providerThreadId: "t-local" }]);
    mocks.upsertGmailMessage.mockResolvedValue({ wrote: true, providerThreadId: "t-missing" });
    mocks.applyThreadLabelFlags.mockResolvedValue(undefined);

    const gmail = {
      users: {
        threads: {
          get: vi.fn().mockResolvedValue({
            data: {
              messages: [{ id: "m1", labelIds: ["INBOX"] }],
            },
          }),
        },
      },
    };

    const result = await repairMissingInboxThreads({
      gmail: gmail as never,
      tenantId: "tenant",
      emailAccount: { id: "acc", email: "a@b.cl", userId: "u1" },
      deadline: Date.now() + 10_000,
    });

    expect(result).toEqual({ imported: 1, missing: 1, complete: true });
    expect(mocks.upsertGmailMessage).toHaveBeenCalledOnce();
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("complete=false si el deadline corta a mitad de import", async () => {
    mocks.listGmailThreadIdSet.mockResolvedValue({
      ids: new Set(["a", "b", "c"]),
      complete: true,
    });
    mocks.findMany.mockResolvedValue([]);
    const gmail = {
      users: {
        threads: {
          get: vi.fn().mockImplementation(async () => {
            // simula que el deadline ya venció en la 2ª llamada
            return { data: { messages: [{ id: "m", labelIds: ["INBOX"] }] } };
          }),
        },
      },
    };
    mocks.upsertGmailMessage.mockResolvedValue({ wrote: true, providerThreadId: "a" });
    mocks.applyThreadLabelFlags.mockResolvedValue(undefined);

    const result = await repairMissingInboxThreads({
      gmail: gmail as never,
      tenantId: "tenant",
      emailAccount: { id: "acc", email: "a@b.cl", userId: "u1" },
      deadline: Date.now() - 1, // ya vencido → 0 imports, remaining > 0
      cap: 50,
    });

    expect(result.imported).toBe(0);
    expect(result.missing).toBe(3);
    expect(result.complete).toBe(false);
  });
});
