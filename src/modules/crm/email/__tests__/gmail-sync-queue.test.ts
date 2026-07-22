import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  updateEmailAccount: vi.fn(),
  syncGmailAccount: vi.fn(),
  broadcastGmailMailboxChanged: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmGmailSyncJob: {
      upsert: mocks.upsert,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    crmEmailAccount: {
      update: mocks.updateEmailAccount,
    },
  },
}));
vi.mock("../correos-folder-counts", () => ({
  invalidateCorreoFolderCounts: vi.fn(),
}));
vi.mock("../gmail-realtime", () => ({
  broadcastGmailMailboxChanged: mocks.broadcastGmailMailboxChanged,
}));
vi.mock("../gmail-sync.service", () => ({
  syncGmailAccount: mocks.syncGmailAccount,
}));

import {
  enqueueGmailSyncJob,
  gmailSyncRetryDelayMs,
  processGmailSyncJob,
} from "../gmail-sync-queue";

describe("gmail sync queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.broadcastGmailMailboxChanged.mockResolvedValue(undefined);
    mocks.updateEmailAccount.mockResolvedValue({});
    mocks.syncGmailAccount.mockResolvedValue({
      syncedCount: 1,
      fetched: 1,
      mode: "incremental",
      reconcile: "skipped",
      healed: 0,
    });
  });

  it("coalesce por emailAccountId mediante upsert singleton", async () => {
    await enqueueGmailSyncJob({
      tenantId: "tenant",
      emailAccountId: "account",
      reason: "push",
      historyId: "123",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
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

  it("un delta no consume un mantenimiento pendiente y usa lease mayor a 60 s", async () => {
    const requestedAt = new Date("2026-07-22T12:00:00.000Z");
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: 0,
      reason: "cron",
      requestedAt,
      maintenanceRequested: true,
      emailAccount: {
        id: "account",
        tenantId: "tenant",
        userId: "user",
        email: "user@example.com",
        status: "active",
      },
    });

    const before = Date.now();
    await processGmailSyncJob({
      emailAccountId: "account",
      profile: "delta",
    });

    const claim = mocks.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual(
      expect.objectContaining({
        id: "job",
        requestedAt,
        maintenanceRequested: true,
      }),
    );
    expect(claim.data.pending).toBe(true);
    expect(claim.data.maintenanceRequested).toBeUndefined();
    expect(claim.data.leaseUntil.getTime() - before).toBeGreaterThanOrEqual(
      69_000,
    );
  });

  it("consume mantenimiento al reclamar y lo restaura si falla", async () => {
    const requestedAt = new Date("2026-07-22T12:00:00.000Z");
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: 2,
      reason: "cron",
      requestedAt,
      maintenanceRequested: true,
      emailAccount: {
        id: "account",
        tenantId: "tenant",
        userId: "user",
        email: "user@example.com",
        status: "active",
      },
    });
    mocks.syncGmailAccount.mockRejectedValue(new Error("temporal"));

    await expect(
      processGmailSyncJob({ emailAccountId: "account" }),
    ).rejects.toThrow("temporal");

    expect(mocks.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        pending: false,
        maintenanceRequested: false,
      }),
    );
    expect(mocks.updateMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ requestedAt }),
        data: expect.objectContaining({
          pending: true,
          maintenanceRequested: true,
          reason: "retry",
        }),
      }),
    );
  });

  it("detiene el job cuando Gmail revoca las credenciales", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: 1,
      reason: "push",
      requestedAt: new Date("2026-07-22T12:00:00.000Z"),
      maintenanceRequested: false,
      emailAccount: {
        id: "account",
        tenantId: "tenant",
        userId: "user",
        email: "user@example.com",
        status: "active",
      },
    });
    mocks.syncGmailAccount.mockRejectedValue(
      new Error("invalid_grant: token revoked"),
    );

    await expect(
      processGmailSyncJob({ emailAccountId: "account" }),
    ).rejects.toThrow("invalid_grant");

    expect(mocks.updateMany.mock.calls[1][0].data).toEqual(
      expect.objectContaining({
        pending: false,
        maintenanceRequested: false,
        leaseToken: null,
      }),
    );
    expect(mocks.updateEmailAccount).toHaveBeenCalledWith({
      where: { id: "account" },
      data: { status: "revoked" },
    });
  });
});
