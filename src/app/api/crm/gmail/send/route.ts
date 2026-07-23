/**
 * API Route: /api/crm/gmail/send
 * POST - Enviar correo con Gmail conectado.
 *
 * PR-12: por defecto ENCOLA en crm.email_outbox (idempotencia por
 * `idempotencyKey`, ventana de deshacer, envío programado) y responde de
 * inmediato; el despacho real ocurre en after() al vencer la ventana o vía
 * cron. EMAIL_OUTBOX_BYPASS=1 restaura el envío directo (rollback).
 */

import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { normalizeEmailList } from "@/lib/email-address";
import { requireTenantModule } from "@/lib/require-module";
import { resolveSenderAccount } from "@/modules/crm/email/sender-account";
import {
  MAX_EMAIL_ATTACHMENTS,
  MAX_EMAIL_ATTACHMENT_BYTES,
  isBlockedEmailAttachment,
  isOwnedEmailAttachmentKey,
  sanitizeEmailAttachmentName,
  type StagedEmailAttachment,
} from "@/modules/crm/email/gmail-outbound-attachments";
import { performGmailSend } from "@/modules/crm/email/gmail-send.service";
import {
  dispatchAfterUndoWindow,
  emailUndoWindowMs,
  enqueueOutboxSend,
  outboxBypassEnabled,
  type EmailOutboxPayload,
} from "@/modules/crm/email/email-outbox";
import { captureEmailError } from "@/modules/crm/email/email-observability";

export const maxDuration = 60;

/** Programación acotada: entre 2 minutos y 366 días hacia adelante. */
function parseScheduledAt(raw: unknown): Date | null | "invalid" {
  if (raw == null) return null;
  if (typeof raw !== "string") return "invalid";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "invalid";
  const now = Date.now();
  if (date.getTime() < now + 2 * 60_000) return "invalid";
  if (date.getTime() > now + 366 * 24 * 60 * 60_000) return "invalid";
  return date;
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    const {
      to,
      cc = [],
      bcc = [],
      subject,
      html,
      text,
      dealId,
      accountId,
      contactId,
      threadId,
      emailAccountId: requestedEmailAccountId,
      attachments: rawAttachments = [],
      idempotencyKey: rawIdempotencyKey,
      scheduledAt: rawScheduledAt,
      fromAlias: rawFromAlias,
      inlineImages: rawInlineImages = [],
      forwardFromThreadId: rawForwardFromThreadId,
      forwardAttachments: rawForwardAttachments = [],
      providerDraftId: rawProviderDraftId,
    } = body;

    // `to` acepta string (compat) o string[] (Para editable / Responder a todos).
    const toList = (Array.isArray(to) ? to : [to]).filter(
      (v: unknown): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (toList.length === 0 || typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json(
        { success: false, error: "to y subject son requeridos" },
        { status: 400 },
      );
    }

    const ccList = (Array.isArray(cc) ? cc : [cc]).filter(
      (value: unknown): value is string => typeof value === "string",
    );
    const bccList = (Array.isArray(bcc) ? bcc : [bcc]).filter(
      (value: unknown): value is string => typeof value === "string",
    );
    const normalizedToEmails = normalizeEmailList(toList);
    const normalizedCcEmails = normalizeEmailList(ccList);
    const normalizedBccEmails = normalizeEmailList(bccList);

    const stagedAttachments: StagedEmailAttachment[] = [];
    if (!Array.isArray(rawAttachments)) {
      return NextResponse.json(
        { success: false, error: "attachments inválido" },
        { status: 400 },
      );
    }
    if (rawAttachments.length > MAX_EMAIL_ATTACHMENTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Máximo ${MAX_EMAIL_ATTACHMENTS} adjuntos por correo`,
        },
        { status: 400 },
      );
    }
    for (const value of rawAttachments) {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.storageKey !== "string" ||
        typeof value.fileName !== "string" ||
        typeof value.mimeType !== "string" ||
        typeof value.size !== "number" ||
        !Number.isFinite(value.size) ||
        value.size <= 0
      ) {
        return NextResponse.json(
          { success: false, error: "Metadata de adjunto inválida" },
          { status: 400 },
        );
      }
      stagedAttachments.push({
        storageKey: value.storageKey,
        fileName: sanitizeEmailAttachmentName(value.fileName),
        mimeType: value.mimeType,
        size: value.size,
      });
    }
    if (
      stagedAttachments.reduce((sum, attachment) => sum + attachment.size, 0) >
      MAX_EMAIL_ATTACHMENT_BYTES
    ) {
      return NextResponse.json(
        { success: false, error: "Los adjuntos superan 25 MB en total" },
        { status: 400 },
      );
    }
    for (const attachment of stagedAttachments) {
      if (
        !isOwnedEmailAttachmentKey({
          storageKey: attachment.storageKey,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        })
      ) {
        return NextResponse.json(
          { success: false, error: "Adjunto no autorizado" },
          { status: 403 },
        );
      }
      if (isBlockedEmailAttachment(attachment.fileName, attachment.mimeType)) {
        return NextResponse.json(
          {
            success: false,
            error: `Gmail no permite adjuntar “${attachment.fileName}”`,
          },
          { status: 400 },
        );
      }
    }

    // ── Imágenes inline CID (P06): staged igual que adjuntos + contentId ──
    const inlineImages: Array<StagedEmailAttachment & { contentId: string }> = [];
    if (!Array.isArray(rawInlineImages)) {
      return NextResponse.json(
        { success: false, error: "inlineImages inválido" },
        { status: 400 },
      );
    }
    for (const value of rawInlineImages) {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.storageKey !== "string" ||
        typeof value.contentId !== "string" ||
        !value.contentId.trim() ||
        typeof value.fileName !== "string" ||
        typeof value.mimeType !== "string" ||
        !value.mimeType.startsWith("image/") ||
        typeof value.size !== "number" ||
        !Number.isFinite(value.size) ||
        value.size <= 0 ||
        !isOwnedEmailAttachmentKey({
          storageKey: value.storageKey,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        })
      ) {
        return NextResponse.json(
          { success: false, error: "Imagen inline inválida" },
          { status: 400 },
        );
      }
      inlineImages.push({
        storageKey: value.storageKey,
        fileName: sanitizeEmailAttachmentName(value.fileName),
        mimeType: value.mimeType,
        size: value.size,
        contentId: value.contentId.trim(),
      });
    }

    // ── Forward (C13): refs de adjuntos originales a re-adjuntar ──
    const forwardAttachments: Array<{
      providerMessageId: string;
      attachmentId: string;
      fileName: string;
      size: number | null;
    }> = [];
    if (!Array.isArray(rawForwardAttachments)) {
      return NextResponse.json(
        { success: false, error: "forwardAttachments inválido" },
        { status: 400 },
      );
    }
    for (const value of rawForwardAttachments) {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.providerMessageId !== "string" ||
        typeof value.attachmentId !== "string" ||
        typeof value.fileName !== "string"
      ) {
        return NextResponse.json(
          { success: false, error: "Adjunto de reenvío inválido" },
          { status: 400 },
        );
      }
      forwardAttachments.push({
        providerMessageId: value.providerMessageId,
        attachmentId: value.attachmentId,
        fileName: sanitizeEmailAttachmentName(value.fileName),
        size: typeof value.size === "number" ? value.size : null,
      });
    }
    const forwardFromThreadId =
      typeof rawForwardFromThreadId === "string" && rawForwardFromThreadId
        ? rawForwardFromThreadId
        : null;
    if (forwardAttachments.length > 0 && !forwardFromThreadId) {
      return NextResponse.json(
        { success: false, error: "forwardFromThreadId es requerido para re-adjuntar" },
        { status: 400 },
      );
    }

    const scheduledAt = parseScheduledAt(rawScheduledAt);
    if (scheduledAt === "invalid") {
      return NextResponse.json(
        {
          success: false,
          error: "scheduledAt inválido (mínimo 2 minutos, máximo 1 año)",
        },
        { status: 400 },
      );
    }

    // B1: en reply la casilla es la dueña del hilo; en composición nueva la
    // seleccionada explícitamente (o la única conectada). Nunca findFirst.
    const senderResult = await resolveSenderAccount({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      threadId: typeof threadId === "string" ? threadId : null,
      emailAccountId:
        typeof requestedEmailAccountId === "string"
          ? requestedEmailAccountId
          : null,
    });
    if (!senderResult.ok) {
      return NextResponse.json(
        { success: false, error: senderResult.error },
        { status: senderResult.status },
      );
    }
    const emailAccount = senderResult.account;
    if (!emailAccount.accessTokenEncrypted) {
      return NextResponse.json(
        { success: false, error: "Gmail no conectado" },
        { status: 400 },
      );
    }

    const payload: EmailOutboxPayload = {
      to: normalizedToEmails,
      cc: normalizedCcEmails,
      bcc: normalizedBccEmails,
      subject: subject.trim(),
      html: typeof html === "string" ? html : null,
      text: typeof text === "string" ? text : null,
      threadId: typeof threadId === "string" && threadId ? threadId : null,
      dealId: typeof dealId === "string" && dealId ? dealId : null,
      accountId: typeof accountId === "string" && accountId ? accountId : null,
      contactId: typeof contactId === "string" && contactId ? contactId : null,
      attachments: stagedAttachments,
      userEmail: ctx.userEmail ?? null,
      fromAlias:
        typeof rawFromAlias === "string" && rawFromAlias.trim()
          ? rawFromAlias.trim().toLowerCase()
          : null,
      inlineImages,
      forwardFromThreadId,
      forwardAttachments,
      providerDraftId:
        typeof rawProviderDraftId === "string" && rawProviderDraftId
          ? rawProviderDraftId
          : null,
    };

    // ── Rollback: envío directo sin outbox (comportamiento previo) ──
    if (outboxBypassEnabled()) {
      const result = await performGmailSend({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        emailAccountId: emailAccount.id,
        ...payload,
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: result.status },
        );
      }
      if (result.reconciled) {
        return NextResponse.json(
          {
            success: true,
            warning:
              "Gmail aceptó el correo; OPAI completará el historial en la próxima sincronización.",
            data: {
              threadId: null,
              messageId: null,
              providerMessageId: result.providerMessageId,
            },
          },
          { status: 202 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          threadId: result.threadId,
          messageId: result.messageId,
          providerMessageId: result.providerMessageId,
        },
      });
    }

    // ── Flujo outbox: encolar y responder ya ──
    const idempotencyKey =
      typeof rawIdempotencyKey === "string" &&
      rawIdempotencyKey.length >= 8 &&
      rawIdempotencyKey.length <= 128
        ? rawIdempotencyKey
        : randomUUID();

    const { item, created } = await enqueueOutboxSend({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      emailAccountId: emailAccount.id,
      idempotencyKey,
      payload,
      scheduledAt,
    });

    // Despacho inmediato al vencer la ventana de deshacer (los programados
    // los levanta el cron). Solo el enqueue que creó el item agenda el after:
    // el claim condicional igual haría inocuo un doble despacho.
    if (created && !item.scheduledAt) {
      after(() => dispatchAfterUndoWindow(item));
    }

    return NextResponse.json(
      {
        success: true,
        queued: true,
        data: {
          outboxId: item.id,
          status: item.status,
          undoUntil: item.undoUntil?.toISOString() ?? null,
          scheduledAt: item.scheduledAt?.toISOString() ?? null,
          undoWindowMs: emailUndoWindowMs(),
          duplicate: !created,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    captureEmailError(error, { scope: "send" });
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el correo por Gmail" },
      { status: 502 },
    );
  }
}
