import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmGmailSyncJob: { upsert },
  },
}));
vi.mock("../correos-folder-counts", () => ({
  invalidateCorreoFolderCounts: vi.fn(),
}));
vi.mock("../gmail-realtime", () => ({
  broadcastGmailMailboxChanged: vi.fn(),
}));
vi.mock("../gmail-sync.service", () => ({
  syncGmailAccount: vi.fn(),
}));

import {
  enqueueGmailSyncJob,
  gmailSyncRetryDelayMs,
} from "../gmail-sync-queue";

describe("gmail sync queue", () => {
  beforeEach(() => upsert.mockReset());

  it("coalesce por emailAccountId mediante upsert singleton", async () => {
    await enqueueGmailSyncJob({
      tenantId: "tenant",
      emailAccountId: "account",
      reason: "push",
      historyId: "123",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId: "account" },
        update: expect.objectContaining({
          pending: true,
          requestedHistoryId: "123",
        }),
      }),
    );
  });

  it("aplica backoff exponencial con techo de cinco minutos", () => {
    expect(gmailSyncRetryDelayMs(1)).toBe(5_000);
    expect(gmailSyncRetryDelayMs(2)).toBe(10_000);
    expect(gmailSyncRetryDelayMs(20)).toBe(300_000);
  });
});
