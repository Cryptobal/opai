/**
 * Outbox de envío Gmail (PR-12, R1): encolar-y-despachar con idempotencia,
 * ventana de deshacer y envío programado.
 *
 * Flujo:
 *  1. POST /api/crm/gmail/send valida y ENCOLA (status `queued` con
 *     `undo_until = now + ventana`, o `held` con `scheduled_at` futuro) y
 *     responde de inmediato.
 *  2. El despachador (after() del enqueue para inmediatos + cron por minuto
 *     como red de seguridad y para programados) reclama el item con un
 *     updateMany condicional (nunca dos despachos del mismo item) y ejecuta
 *     `performGmailSend`.
 *  3. Reintentos con backoff exponencial; tras MAX_ATTEMPTS queda `failed`
 *     visible (no silencio). "Deshacer"/cancelar solo aplica antes del claim.
 *
 * Idempotencia: `idempotency_key` UNIQUE. Reenviar el mismo intento de
 * composición (retry de red, doble click, replay) NUNCA produce 2 correos:
 * el segundo enqueue devuelve el item existente.
 *
 * Rollback: EMAIL_OUTBOX_BYPASS=1 vuelve al envío directo (comportamiento
 * previo, sin deshacer ni programados).
 */
import { Prisma, type CrmEmailOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";
import type { StagedEmailAttachment } from "./gmail-outbound-attachments";
import {
  performGmailSend,
  type ForwardAttachmentRef,
  type StagedInlineImage,
} from "./gmail-send.service";
import { captureEmailError } from "./email-observability";

export const EMAIL_OUTBOX_MAX_ATTEMPTS = 5;

/** Ventana por defecto al conectar Gmail / envío inmediato: 10 s (estilo Gmail). */
export function emailUndoWindowMs(): number {
  const raw = Number(process.env.EMAIL_UNDO_WINDOW_SECONDS);
  return Number.isFinite(raw) && raw >= 0 ? raw * 1000 : 10_000;
}

export function outboxBypassEnabled(): boolean {
  return process.env.EMAIL_OUTBOX_BYPASS === "1";
}

/** Inputs MIME persistidos en `payload` (ya validados y normalizados). */
export type EmailOutboxPayload = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string | null;
  text: string | null;
  threadId: string | null;
  dealId: string | null;
  accountId: string | null;
  contactId: string | null;
  attachments: StagedEmailAttachment[];
  userEmail: string | null;
  fromAlias?: string | null;
  inlineImages?: StagedInlineImage[];
  forwardFromThreadId?: string | null;
  forwardAttachments?: ForwardAttachmentRef[];
  providerDraftId?: string | null;
};

/** Backoff exponencial del despacho: 30s, 2m, 8m, 30m (cap). */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(30_000 * 4 ** Math.max(attempts - 1, 0), 30 * 60_000);
}

/** Where de items listos para despachar (undo vencido, programación cumplida, backoff cumplido). */
export function dueOutboxWhere(now: Date) {
  return {
    status: { in: ["queued", "held"] },
    AND: [
      { OR: [{ undoUntil: null }, { undoUntil: { lte: now } }] },
      { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
      { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    ],
  } satisfies Prisma.CrmEmailOutboxWhereInput;
}

export type EnqueueOutboxResult = {
  item: CrmEmailOutbox;
  /** false si la key ya existía (reintento idempotente). */
  created: boolean;
};

export async function enqueueOutboxSend(params: {
  tenantId: string;
  userId: string;
  emailAccountId: string;
  idempotencyKey: string;
  payload: EmailOutboxPayload;
  scheduledAt?: Date | null;
  undoWindowMs?: number;
}): Promise<EnqueueOutboxResult> {
  const scheduledAt = params.scheduledAt ?? null;
  const undoWindow = params.undoWindowMs ?? emailUndoWindowMs();
  try {
    const item = await prisma.crmEmailOutbox.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        emailAccountId: params.emailAccountId,
        idempotencyKey: params.idempotencyKey,
        status: scheduledAt ? "held" : "queued",
        scheduledAt,
        undoUntil: scheduledAt ? null : new Date(Date.now() + undoWindow),
        payload: params.payload as unknown as Prisma.InputJsonValue,
      },
    });
    return { item, created: true };
  } catch (error) {
    // Carrera o reintento con la misma key: el unique garantiza 1 solo item.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.crmEmailOutbox.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing && existing.tenantId === params.tenantId) {
        return { item: existing, created: false };
      }
    }
    throw error;
  }
}

/** Cancela (deshacer / cancelar programado) si aún no fue reclamado. */
export async function cancelOutboxItem(params: {
  id: string;
  tenantId: string;
  userId: string;
}): Promise<{ cancelled: boolean }> {
  const result = await prisma.crmEmailOutbox.updateMany({
    where: {
      id: params.id,
      tenantId: params.tenantId,
      userId: params.userId,
      status: { in: ["queued", "held"] },
    },
    data: { status: "cancelled" },
  });
  if (result.count === 0) return { cancelled: false };
  // Limpia los adjuntos staged del intento cancelado (best-effort).
  const item = await prisma.crmEmailOutbox.findUnique({
    where: { id: params.id },
    select: { payload: true },
  });
  const payload = item?.payload as EmailOutboxPayload | null;
  const staged = [
    ...(payload?.attachments ?? []),
    ...(payload?.inlineImages ?? []),
  ];
  await Promise.allSettled(staged.map((s) => deleteFile(s.storageKey)));
  return { cancelled: true };
}

/**
 * Despacha UN item por id: claim condicional (queued/held + due) → envío →
 * sent | reintento con backoff | failed. Seguro ante carreras after()/cron:
 * solo un claim gana.
 */
export async function dispatchOutboxItem(id: string): Promise<
  "sent" | "skipped" | "retry" | "failed"
> {
  const now = new Date();
  const claimed = await prisma.crmEmailOutbox.updateMany({
    where: { id, ...dueOutboxWhere(now) },
    data: { status: "sending", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";

  const item = await prisma.crmEmailOutbox.findUnique({ where: { id } });
  if (!item) return "skipped";
  const payload = item.payload as EmailOutboxPayload;

  const result = await performGmailSend({
    tenantId: item.tenantId,
    userId: item.userId,
    userEmail: payload.userEmail,
    emailAccountId: item.emailAccountId,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    threadId: payload.threadId,
    dealId: payload.dealId,
    accountId: payload.accountId,
    contactId: payload.contactId,
    attachments: payload.attachments,
    fromAlias: payload.fromAlias ?? null,
    inlineImages: payload.inlineImages ?? [],
    forwardFromThreadId: payload.forwardFromThreadId ?? null,
    forwardAttachments: payload.forwardAttachments ?? [],
    providerDraftId: payload.providerDraftId ?? null,
  });

  if (result.ok) {
    await prisma.crmEmailOutbox.update({
      where: { id },
      data: {
        status: "sent",
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        messageId: result.messageId,
        lastError: null,
      },
    });
    return "sent";
  }

  const exhausted = item.attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS || !result.retryable;
  await prisma.crmEmailOutbox.update({
    where: { id },
    data: exhausted
      ? { status: "failed", lastError: result.error }
      : {
          status: "queued",
          lastError: result.error,
          nextAttemptAt: new Date(Date.now() + outboxBackoffMs(item.attempts)),
        },
  });
  return exhausted ? "failed" : "retry";
}

/** Barrido del cron: despacha lo vencido (undo expirado, programados, reintentos). */
export async function dispatchDueOutbox(params?: {
  limit?: number;
  deadlineMs?: number;
}): Promise<{ sent: number; failed: number; retried: number; skipped: number }> {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
  const deadline = params?.deadlineMs ?? Date.now() + 50_000;
  const due = await prisma.crmEmailOutbox.findMany({
    where: dueOutboxWhere(new Date()),
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const stats = { sent: 0, failed: 0, retried: 0, skipped: 0 };
  for (const item of due) {
    if (Date.now() > deadline) break;
    try {
      const outcome = await dispatchOutboxItem(item.id);
      if (outcome === "sent") stats.sent += 1;
      else if (outcome === "failed") stats.failed += 1;
      else if (outcome === "retry") stats.retried += 1;
      else stats.skipped += 1;
    } catch (error) {
      captureEmailError(error, { scope: "outbox-dispatch" });
      stats.failed += 1;
    }
  }
  return stats;
}

/**
 * Espera la ventana de deshacer y despacha (para el after() del enqueue).
 * El claim condicional hace inocuo el doble despacho con el cron.
 */
export async function dispatchAfterUndoWindow(item: {
  id: string;
  undoUntil: Date | null;
}): Promise<void> {
  const waitMs = item.undoUntil
    ? Math.max(item.undoUntil.getTime() - Date.now(), 0)
    : 0;
  // Margen de 250ms para no despertar justo antes del vencimiento.
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs + 250));
  try {
    await dispatchOutboxItem(item.id);
  } catch (error) {
    captureEmailError(error, { scope: "outbox-dispatch-after" });
  }
}

/** Storage keys de adjuntos referenciados por items pendientes (para el cleanup cron). */
export async function pendingOutboxStorageKeys(): Promise<Set<string>> {
  const rows = await prisma.crmEmailOutbox.findMany({
    where: { status: { in: ["queued", "held", "sending"] } },
    select: { payload: true },
  });
  const keys = new Set<string>();
  for (const row of rows) {
    const payload = row.payload as EmailOutboxPayload | null;
    for (const staged of [
      ...(payload?.attachments ?? []),
      ...(payload?.inlineImages ?? []),
    ]) {
      if (staged?.storageKey) keys.add(staged.storageKey);
    }
  }
  return keys;
}
