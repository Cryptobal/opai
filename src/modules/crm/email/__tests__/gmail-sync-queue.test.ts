import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  updateEmailAccount: vi.fn(),
  syncGmailAccount: vi.fn(),
  broadcastGmailMailboxChanged: vi.fn(),
  dlqFindFirst: vi.fn(),
  dlqCreate: vi.fn(),
  dlqUpdate: vi.fn(),
  dlqUpdateMany: vi.fn(),
  captureEmailError: vi.fn(),
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
    crmEmailSyncDeadLetter: {
      findFirst: mocks.dlqFindFirst,
      create: mocks.dlqCreate,
      update: mocks.dlqUpdate,
      updateMany: mocks.dlqUpdateMany,
    },
  },
}));
vi.mock("../email-observability", () => ({
  captureEmailError: mocks.captureEmailError,
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
  GMAIL_SYNC_PARK_THRESHOLD,
  gmailSyncRetryDelayMs,
  isGmailSyncParked,
  processGmailSyncJob,
} from "../gmail-sync-queue";

describe("gmail sync queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.broadcastGmailMailboxChanged.mockResolvedValue(undefined);
    mocks.updateEmailAccount.mockResolvedValue({});
    mocks.dlqFindFirst.mockResolvedValue(null);
    mocks.dlqCreate.mockResolvedValue({});
    mocks.dlqUpdate.mockResolvedValue({});
    mocks.dlqUpdateMany.mockResolvedValue({ count: 0 });
    mocks.syncGmailAccount.mockResolvedValue({
      syncedCount: 1,
      fetched: 1,
      mode: "incremental",
      backfillDone: true,
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
        maintenanceRequested: true,
      }),
    );
    expect(claim.where).not.toHaveProperty("requestedAt");
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
        where: expect.objectContaining({ leaseToken: expect.any(String) }),
        data: expect.objectContaining({
          pending: true,
          maintenanceRequested: true,
          reason: "retry",
        }),
      }),
    );
    expect(mocks.updateMany.mock.calls[1][0].where).not.toHaveProperty(
      "requestedAt",
    );
  });

  it("aparca el job en la DLQ al superar el umbral de reintentos (T14)", async () => {
    const requestedAt = new Date("2026-07-22T12:00:00.000Z");
    mocks.findUnique.mockResolvedValue({
      id: "job",
      // attempts previos = umbral - 1: esta corrida es el intento del umbral.
      attempts: GMAIL_SYNC_PARK_THRESHOLD - 1,
      reason: "push",
      requestedAt,
      requestedHistoryId: "h-1",
      maintenanceRequested: false,
      emailAccount: {
        id: "account",
        tenantId: "tenant",
        userId: "user",
        email: "user@example.com",
        status: "active",
      },
    });
    mocks.syncGmailAccount.mockRejectedValue(new Error("veneno persistente"));

    await expect(
      processGmailSyncJob({ emailAccountId: "account" }),
    ).rejects.toThrow("veneno persistente");

    // Dead letter insertado con contexto del job.
    expect(mocks.dlqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant",
          emailAccountId: "account",
          attempts: GMAIL_SYNC_PARK_THRESHOLD,
          reason: expect.stringContaining("veneno"),
        }),
      }),
    );
    // El job queda parked: fuera de la cola, sin retry programado.
    const parkUpdate = mocks.updateMany.mock.calls[1][0];
    expect(parkUpdate.data).toEqual(
      expect.objectContaining({ pending: false, leaseToken: null }),
    );
    expect(parkUpdate.data.availableAt).toBeUndefined();
    // Alerta Sentry de nivel error.
    expect(mocks.captureEmailError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ scope: "sync-queue-parked" }),
    );
  });

  it("bajo el umbral sigue reintentando con backoff (sin DLQ)", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: GMAIL_SYNC_PARK_THRESHOLD - 2,
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
    mocks.syncGmailAccount.mockRejectedValue(new Error("temporal"));

    await expect(
      processGmailSyncJob({ emailAccountId: "account" }),
    ).rejects.toThrow("temporal");

    expect(mocks.dlqCreate).not.toHaveBeenCalled();
    expect(mocks.updateMany.mock.calls[1][0].data).toEqual(
      expect.objectContaining({ pending: true, reason: "retry" }),
    );
  });

  it("re-parking actualiza el dead letter abierto en vez de duplicar", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: GMAIL_SYNC_PARK_THRESHOLD + 3,
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
    mocks.dlqFindFirst.mockResolvedValue({ id: "dlq-1" });
    mocks.syncGmailAccount.mockRejectedValue(new Error("sigue roto"));

    await expect(
      processGmailSyncJob({ emailAccountId: "account" }),
    ).rejects.toThrow("sigue roto");

    expect(mocks.dlqCreate).not.toHaveBeenCalled();
    expect(mocks.dlqUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dlq-1" } }),
    );
  });

  it("una corrida exitosa resuelve los dead letters abiertos", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: 0,
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

    await processGmailSyncJob({ emailAccountId: "account" });

    expect(mocks.dlqUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId: "account", resolvedAt: null },
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      }),
    );
  });

  it("re-encola maintenance si el backfill histórico sigue incompleto", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "job",
      attempts: 0,
      reason: "historical",
      requestedAt: new Date("2026-07-22T12:00:00.000Z"),
      maintenanceRequested: true,
      emailAccount: {
        id: "account",
        tenantId: "tenant",
        userId: "user",
        email: "user@example.com",
        status: "active",
      },
    });
    mocks.syncGmailAccount.mockResolvedValue({
      syncedCount: 100,
      fetched: 100,
      mode: "backfill",
      backfillDone: false,
      reconcile: "skipped",
      healed: 0,
    });
    mocks.upsert.mockResolvedValue({});

    await processGmailSyncJob({ emailAccountId: "account" });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId: "account" },
        update: expect.objectContaining({
          pending: true,
          maintenanceRequested: true,
          reason: "historical",
        }),
      }),
    );
  });

  it("isGmailSyncParked refleja la existencia de un dead letter abierto", async () => {
    mocks.dlqFindFirst.mockResolvedValue({ id: "dlq-1" });
    expect(await isGmailSyncParked("account")).toBe(true);
    mocks.dlqFindFirst.mockResolvedValue(null);
    expect(await isGmailSyncParked("account")).toBe(false);
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
