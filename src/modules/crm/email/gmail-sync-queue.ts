import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { invalidateCorreoFolderCounts } from "./correos-folder-counts";
import { captureEmailError } from "./email-observability";
import { broadcastGmailMailboxChanged } from "./gmail-realtime";
import { syncGmailAccount } from "./gmail-sync.service";

// Todas las rutas que ejecutan el worker tienen maxDuration <= 60 s. El lease
// debe sobrevivir a la invocación para que un cron no arranque otro worker
// mientras el anterior todavía puede persistir un historyId más antiguo.
const LEASE_MS = 70_000;
const MAX_ERROR_LENGTH = 1_000;

/** Umbral de parking (T14): un job que falla esta cantidad de veces seguidas
 * se aparca en la DLQ y deja de reintentarse (env para ajustar sin deploy). */
export const GMAIL_SYNC_PARK_THRESHOLD = Math.max(
  2,
  Number(process.env.GMAIL_SYNC_PARK_THRESHOLD ?? 10),
);

/** true si la casilla tiene un dead letter sin resolver (job aparcado). */
export async function isGmailSyncParked(emailAccountId: string): Promise<boolean> {
  return (await getGmailSyncParkedInfo(emailAccountId)).parked;
}

/** Estado de parking + motivo (recortado) para diagnóstico en la UI: sin
 *  esto, "pausada por errores repetidos" no dice QUÉ falla y la reconexión
 *  a ciegas no resuelve nada. */
export async function getGmailSyncParkedInfo(
  emailAccountId: string,
): Promise<{ parked: boolean; reason: string | null }> {
  const parked = await prisma.crmEmailSyncDeadLetter.findFirst({
    where: { emailAccountId, resolvedAt: null },
    select: { reason: true },
  });
  if (!parked) return { parked: false, reason: null };
  return { parked: true, reason: parked.reason?.slice(0, 240) ?? null };
}

/**
 * Aparca el job en la DLQ: upsert lógico (una fila abierta por casilla — un
 * re-enqueue posterior que vuelva a fallar actualiza la fila en vez de
 * acumular duplicados), job fuera de la cola y alerta Sentry de nivel error.
 */
async function parkGmailSyncJob(params: {
  jobId: string;
  leaseToken: string;
  tenantId: string;
  emailAccountId: string;
  attempts: number;
  reason: string;
  error: unknown;
  payload: Record<string, unknown>;
}): Promise<void> {
  const existing = await prisma.crmEmailSyncDeadLetter.findFirst({
    where: { emailAccountId: params.emailAccountId, resolvedAt: null },
    select: { id: true },
  });
  if (existing) {
    await prisma.crmEmailSyncDeadLetter.update({
      where: { id: existing.id },
      data: {
        reason: params.reason.slice(0, MAX_ERROR_LENGTH),
        payload: params.payload as never,
        attempts: params.attempts,
        parkedAt: new Date(),
      },
    });
  } else {
    await prisma.crmEmailSyncDeadLetter.create({
      data: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        reason: params.reason.slice(0, MAX_ERROR_LENGTH),
        payload: params.payload as never,
        attempts: params.attempts,
      },
    });
  }
  await prisma.crmGmailSyncJob.updateMany({
    where: { id: params.jobId, leaseToken: params.leaseToken },
    data: {
      pending: false,
      maintenanceRequested: false,
      leaseToken: null,
      leaseUntil: null,
      lastError: params.reason.slice(0, MAX_ERROR_LENGTH),
    },
  });
  captureEmailError(params.error, {
    scope: "sync-queue-parked",
    tenantId: params.tenantId,
    emailAccountId: params.emailAccountId,
    extra: { attempts: params.attempts, threshold: GMAIL_SYNC_PARK_THRESHOLD },
  });
}

export function gmailSyncRetryDelayMs(attempts: number): number {
  return Math.min(
    5 * 60_000,
    5_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6),
  );
}

export type GmailSyncReason =
  | "push"
  | "manual"
  | "open"
  | "cron"
  | "oauth"
  | "retry"
  | "action"
  | "send"
  | "historical";

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
    // Una corrida exitosa resuelve cualquier dead letter abierto: la casilla
    // dejó de estar envenenada y el banner de parked se apaga solo.
    await prisma.crmEmailSyncDeadLetter.updateMany({
      where: { emailAccountId: job.emailAccount.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
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

    // T14: la corrida actual es el intento job.attempts + 1 (el claim ya
    // incrementó). Al llegar al umbral el job se aparca en la DLQ y no se
    // programa más retry; un enqueue posterior (push/manual) puede revivirlo.
    const attemptNumber = job.attempts + 1;
    if (attemptNumber >= GMAIL_SYNC_PARK_THRESHOLD) {
      await parkGmailSyncJob({
        jobId: job.id,
        leaseToken,
        tenantId: job.emailAccount.tenantId,
        emailAccountId: job.emailAccount.id,
        attempts: attemptNumber,
        reason: message,
        error,
        payload: {
          reason: job.reason,
          profile,
          requestedHistoryId: job.requestedHistoryId ?? null,
          requestedAt: job.requestedAt.toISOString(),
        },
      });
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
      captureEmailError(error, {
        scope: "sync-queue-flush",
        emailAccountId: job.emailAccountId,
        level: "warning",
      });
    }
  }
  return { processed, busy, failed };
}
