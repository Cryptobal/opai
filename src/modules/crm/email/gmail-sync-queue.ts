import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { invalidateCorreoFolderCounts } from "./correos-folder-counts";
import { broadcastGmailMailboxChanged } from "./gmail-realtime";
import { syncGmailAccount } from "./gmail-sync.service";

// Todas las rutas que ejecutan el worker tienen maxDuration <= 60 s. El lease
// debe sobrevivir a la invocación para que un cron no arranque otro worker
// mientras el anterior todavía puede persistir un historyId más antiguo.
const LEASE_MS = 70_000;
const MAX_ERROR_LENGTH = 1_000;

export function gmailSyncRetryDelayMs(attempts: number): number {
  return Math.min(
    5 * 60_000,
    5_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6),
  );
}

export type GmailSyncReason =
  | "push"
  | "manual"
  | "cron"
  | "oauth"
  | "retry"
  | "action"
  | "send";

export async function enqueueGmailSyncJob(params: {
  tenantId: string;
  emailAccountId: string;
  reason: GmailSyncReason;
  historyId?: string | null;
  maintenance?: boolean;
}): Promise<void> {
  const now = new Date();
  await prisma.crmGmailSyncJob.upsert({
    where: { emailAccountId: params.emailAccountId },
    create: {
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      pending: true,
      maintenanceRequested: params.maintenance === true,
      reason: params.reason,
      requestedHistoryId: params.historyId ?? null,
      requestedAt: now,
      availableAt: now,
    },
    update: {
      pending: true,
      ...(params.maintenance ? { maintenanceRequested: true } : {}),
      reason: params.reason,
      ...(params.historyId !== undefined
        ? { requestedHistoryId: params.historyId }
        : {}),
      requestedAt: now,
      availableAt: now,
    },
  });
}

export type GmailSyncProcessResult =
  | {
      status: "processed";
      syncedCount: number;
      fetched: number;
      mode: "backfill" | "incremental";
      reconcile: "ok" | "partial" | "skipped";
      healed: number;
    }
  | { status: "busy" }
  | { status: "missing" };

/**
 * Reclama un lease corto sin mantener una transacción abierta durante las
 * llamadas de red a Gmail. Un nuevo push puede marcar `pending=true` mientras
 * corre; el worker no toca ese flag al completar.
 */
export async function processGmailSyncJob(params: {
  emailAccountId: string;
  deadlineMs?: number;
  profile?: "delta" | "maintenance";
  maxResults?: number;
  createdByUserId?: string | null;
  forceReconcile?: boolean;
  selfHealBudgetMs?: number;
}): Promise<GmailSyncProcessResult> {
  const now = new Date();
  const leaseToken = randomUUID();
  const job = await prisma.crmGmailSyncJob.findUnique({
    where: { emailAccountId: params.emailAccountId },
    include: {
      emailAccount: {
        select: {
          id: true,
          tenantId: true,
          userId: true,
          email: true,
          status: true,
        },
      },
    },
  });
  if (!job?.emailAccount) return { status: "missing" };

  const profile =
    params.profile ?? (job.maintenanceRequested ? "maintenance" : "delta");
  // Un delta explícito no satisface una solicitud de mantenimiento ya
  // pendiente. Conservamos pending=true para que el flush la procese apenas se
  // libere el lease. Un mantenimiento, en cambio, consume el flag al reclamar.
  const keepPending = profile === "delta" && job.maintenanceRequested;
  const claimed = await prisma.crmGmailSyncJob.updateMany({
    where: {
      id: job.id,
      requestedAt: job.requestedAt,
      maintenanceRequested: job.maintenanceRequested,
      availableAt: { lte: now },
      OR: [
        {
          pending: true,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        { leaseUntil: { lt: now } },
      ],
    },
    data: {
      pending: keepPending,
      ...(profile === "maintenance"
        ? { maintenanceRequested: false }
        : {}),
      leaseToken,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      lastStartedAt: now,
      attempts: { increment: 1 },
    },
  });
  if (claimed.count === 0) return { status: "busy" };

  try {
    const result = await syncGmailAccount({
      tenantId: job.emailAccount.tenantId,
      emailAccountId: job.emailAccount.id,
      profile,
      deadlineMs:
        params.deadlineMs ??
        Date.now() + (profile === "maintenance" ? 50_000 : 20_000),
      maxResults: params.maxResults ?? (profile === "maintenance" ? 300 : 100),
      createdByUserId: params.createdByUserId,
      forceReconcile: params.forceReconcile,
      selfHealBudgetMs: params.selfHealBudgetMs,
    });

    await prisma.crmGmailSyncJob.updateMany({
      where: { id: job.id, leaseToken },
      data: {
        leaseToken: null,
        leaseUntil: null,
        attempts: 0,
        lastError: null,
        lastCompletedAt: new Date(),
      },
    });
    invalidateCorreoFolderCounts(
      job.emailAccount.tenantId,
      job.emailAccount.id,
    );
    await broadcastGmailMailboxChanged({
      tenantId: job.emailAccount.tenantId,
      userId: job.emailAccount.userId,
      reason: job.reason,
      syncedCount: result.syncedCount,
    });
    return { status: "processed", ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid_grant|unauthorized_client|invalid_client/i.test(message)) {
      await prisma.crmGmailSyncJob.updateMany({
        where: { id: job.id, leaseToken },
        data: {
          pending: false,
          maintenanceRequested: false,
          leaseToken: null,
          leaseUntil: null,
          lastError: message.slice(0, MAX_ERROR_LENGTH),
        },
      });
      await prisma.crmEmailAccount
        .update({
          where: { id: job.emailAccount.id },
          data: { status: "revoked" },
        })
        .catch(() => {});
      throw error;
    }

    const backoffMs = gmailSyncRetryDelayMs(job.attempts + 1);
    const retried = await prisma.crmGmailSyncJob.updateMany({
      where: { id: job.id, leaseToken, requestedAt: job.requestedAt },
      data: {
        pending: true,
        ...(profile === "maintenance"
          ? { maintenanceRequested: true }
          : {}),
        reason: "retry",
        availableAt: new Date(Date.now() + backoffMs),
        leaseToken: null,
        leaseUntil: null,
        lastError: message.slice(0, MAX_ERROR_LENGTH),
      },
    });
    if (retried.count === 0) {
      // Llegó otra solicitud durante la corrida: no le imponemos el backoff ni
      // reemplazamos su razón, pero sí liberamos nuestro lease y restauramos un
      // mantenimiento fallido para que la solicitud nueva no lo haga perder.
      await prisma.crmGmailSyncJob.updateMany({
        where: { id: job.id, leaseToken },
        data: {
          pending: true,
          ...(profile === "maintenance"
            ? { maintenanceRequested: true }
            : {}),
          leaseToken: null,
          leaseUntil: null,
          lastError: message.slice(0, MAX_ERROR_LENGTH),
        },
      });
    }
    throw error;
  }
}

export async function flushGmailSyncJobs(params?: {
  limit?: number;
  deadlineMs?: number;
}): Promise<{ processed: number; busy: number; failed: number }> {
  const limit = Math.min(Math.max(params?.limit ?? 10, 1), 50);
  const deadlineMs = params?.deadlineMs ?? Date.now() + 50_000;
  const now = new Date();
  const jobs = await prisma.crmGmailSyncJob.findMany({
    where: {
      availableAt: { lte: now },
      OR: [{ pending: true }, { leaseUntil: { lt: now } }],
    },
    orderBy: [{ maintenanceRequested: "desc" }, { requestedAt: "asc" }],
    take: limit,
    select: { emailAccountId: true },
  });

  let processed = 0;
  let busy = 0;
  let failed = 0;
  for (const job of jobs) {
    if (Date.now() >= deadlineMs - 5_000) break;
    try {
      const result = await processGmailSyncJob({
        emailAccountId: job.emailAccountId,
        deadlineMs,
      });
      if (result.status === "processed") processed += 1;
      else busy += 1;
    } catch (error) {
      failed += 1;
      console.warn("[gmail-sync-queue] job falló", job.emailAccountId, error);
    }
  }
  return { processed, busy, failed };
}
