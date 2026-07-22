/**
 * API Route: /api/crm/gmail/send
 * POST - Enviar correo con Gmail conectado
 */

import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";
import { requireTenantModule } from '@/lib/require-module';
import { resolveReplyContext } from "@/modules/crm/email/gmail-reply";
import { resolveSenderAccount } from "@/modules/crm/email/sender-account";
import { gmailClientForAccount } from "@/modules/crm/email/gmail-account-client";
import { buildGmailRawMessage } from "@/modules/crm/email/gmail-mime";
import {
  MAX_EMAIL_ATTACHMENTS,
  MAX_EMAIL_ATTACHMENT_BYTES,
  MAX_GMAIL_RAW_MESSAGE_BYTES,
  isBlockedEmailAttachment,
  isOwnedEmailAttachmentKey,
  sanitizeEmailAttachmentName,
  type StagedEmailAttachment,
} from "@/modules/crm/email/gmail-outbound-attachments";
import { deleteFile } from "@/lib/storage";
import { upsertLinkedThread } from "@/modules/crm/email/thread-linking";
import { broadcastGmailMailboxChanged } from "@/modules/crm/email/gmail-realtime";
import {
  enqueueGmailSyncJob,
  processGmailSyncJob,
} from "@/modules/crm/email/gmail-sync-queue";
import {
  getStagedEmailFileBuffer,
  getStagedEmailFileMetadata,
} from "@/modules/crm/email/gmail-staging-storage";
import { auditEmailAction } from "@/lib/audit-email";
import { captureEmailError } from "@/modules/crm/email/email-observability";
import { recordRecipients } from "@/modules/crm/email/email-recipients";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let acceptedByGmail: {
    providerMessageId: string | null;
    providerThreadId: string | null;
    tenantId: string;
    userId: string;
    emailAccountId: string;
    storageKeys: string[];
  } | null = null;
  try {
    const modCheck = await requireTenantModule('crm');
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
    } = body;

    // `to` acepta string (compat) o string[] (Para editable / Responder a todos).
    const toList = (Array.isArray(to) ? to : [to]).filter(
      (v: unknown): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (
      toList.length === 0 ||
      typeof subject !== "string" ||
      !subject.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "to y subject son requeridos" },
        { status: 400 }
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
        { status: 400 }
      );
    }

    const outboundAttachments: Array<{
      fileName: string;
      mimeType: string;
      content: Buffer;
    }> = [];
    let actualAttachmentBytes = 0;
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
      if (
        isBlockedEmailAttachment(attachment.fileName, attachment.mimeType)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Gmail no permite adjuntar “${attachment.fileName}”`,
          },
          { status: 400 },
        );
      }
      const metadata = await getStagedEmailFileMetadata(attachment.storageKey);
      if (
        metadata.size !== attachment.size ||
        !metadata.eTag ||
        metadata.mimeType !== attachment.mimeType ||
        actualAttachmentBytes + metadata.size > MAX_EMAIL_ATTACHMENT_BYTES
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `La metadata de “${attachment.fileName}” no coincide con la subida`,
          },
          { status: 400 },
        );
      }
      const content = await getStagedEmailFileBuffer({
        storageKey: attachment.storageKey,
        expectedSize: metadata.size,
        eTag: metadata.eTag,
      });
      actualAttachmentBytes += content.length;
      outboundAttachments.push({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        content,
      });
    }

    // ── Inyectar firma del usuario ──
    let finalHtml = typeof html === "string" ? html : "";
    let signatureId: string | null = null;

    try {
      const signature = await prisma.crmEmailSignature.findFirst({
        where: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          isDefault: true,
          isActive: true,
        },
      });

      // Si no hay firma del usuario, buscar firma default del tenant
      const sig =
        signature ||
        (await prisma.crmEmailSignature.findFirst({
          where: {
            tenantId: ctx.tenantId,
            isDefault: true,
            isActive: true,
          },
        }));

      if (sig?.htmlContent) {
        finalHtml += sig.htmlContent;
        signatureId = sig.id;
      }
    } catch (sigError) {
      console.error("Error cargando firma:", sigError);
    }

    const gmail = gmailClientForAccount(emailAccount);
    if (!gmail) {
      return NextResponse.json(
        { success: false, error: "Gmail no conectado" },
        { status: 400 },
      );
    }

    // Modo respuesta en hilo: si viene threadId (CrmEmailThread interno), agrupa
    // en el mismo hilo de Gmail y agrega headers In-Reply-To/References.
    const replyCtx = threadId
      ? await resolveReplyContext({ gmail, tenantId: ctx.tenantId, threadId })
      : null;

    const raw = buildGmailRawMessage({
      from: emailAccount.email,
      to: normalizedToEmails,
      cc: normalizedCcEmails,
      bcc: normalizedBccEmails,
      subject: subject.trim(),
      html: finalHtml || undefined,
      text: finalHtml
        ? undefined
        : typeof text === "string"
          ? text
          : undefined,
      inReplyTo: replyCtx?.inReplyTo ?? undefined,
      references: replyCtx?.references ?? undefined,
      attachments: outboundAttachments,
    });
    if (
      Buffer.byteLength(raw, "base64url") > MAX_GMAIL_RAW_MESSAGE_BYTES
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El mensaje completo supera el máximo de 35 MB de Gmail; reducí los adjuntos",
        },
        { status: 400 },
      );
    }

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(replyCtx?.gmailThreadId ? { threadId: replyCtx.gmailThreadId } : {}) },
    });

    const messageId = response.data.id;
    const providerThreadId =
      response.data.threadId ?? replyCtx?.gmailThreadId ?? null;
    acceptedByGmail = {
      providerMessageId: messageId ?? null,
      providerThreadId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      emailAccountId: emailAccount.id,
      storageKeys: stagedAttachments.map(
        (attachment) => attachment.storageKey,
      ),
    };
    const sentAt = new Date();
    const threadRecord = replyCtx
      ? { id: replyCtx.threadId }
      : await upsertLinkedThread({
          tenantId: ctx.tenantId,
          subject: subject.trim(),
          lastMessageAt: sentAt,
          counterpartyEmails: [
            ...normalizedToEmails,
            ...normalizedCcEmails,
          ],
          emailAccountId: emailAccount.id,
          providerThreadId,
          isInbound: false,
        });

    const messageData = {
      tenantId: ctx.tenantId,
      threadId: threadRecord.id,
      providerMessageId: messageId || null,
      direction: "out",
      fromEmail: normalizeEmailAddress(emailAccount.email),
      toEmails: normalizedToEmails,
      ccEmails: normalizedCcEmails,
      bccEmails: normalizedBccEmails,
      subject: subject.trim(),
      htmlBody: finalHtml || null,
      textBody: typeof text === "string" ? text : null,
      sentAt,
      createdBy: ctx.userId,
      status: "sent",
      source: "gmail",
      signatureId,
      emailAccountId: emailAccount.id,
      labelIds: ["SENT"],
    };
    const message = await prisma.$transaction(async (tx) => {
      const existingMessage = messageId
        ? await tx.crmEmailMessage.findUnique({
            where: {
              emailAccountId_providerMessageId: {
                emailAccountId: emailAccount.id,
                providerMessageId: messageId,
              },
            },
            select: { id: true },
          })
        : null;

      await tx.crmEmailThread.update({
        where: { id: threadRecord.id },
        data: {
          emailAccountId: emailAccount.id,
          ...(providerThreadId ? { providerThreadId } : {}),
          ...(typeof accountId === "string" && accountId ? { accountId } : {}),
          ...(typeof contactId === "string" && contactId
            ? { contactId }
            : {}),
          ...(typeof dealId === "string" && dealId ? { dealId } : {}),
          ...(!existingMessage && outboundAttachments.length > 0
            ? {
                attachmentCount: {
                  increment: outboundAttachments.length,
                },
              }
            : {}),
          ...(replyCtx && !replyCtx.firstReplyAt
            ? { firstReplyAt: sentAt }
            : {}),
        },
      });

      return existingMessage
        ? tx.crmEmailMessage.update({
            where: { id: existingMessage.id },
            data: messageData,
          })
        : tx.crmEmailMessage.create({ data: messageData });
    });

    after(async () => {
      await Promise.allSettled(
        stagedAttachments.map((attachment) =>
          deleteFile(attachment.storageKey),
        ),
      );
      // C21a: frecency de destinatarios tras envío exitoso (nunca lanza).
      await recordRecipients({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        to: normalizedToEmails,
        cc: normalizedCcEmails,
        bcc: normalizedBccEmails,
        sentAt,
      });
      await broadcastGmailMailboxChanged({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        reason: "send",
        syncedCount: 1,
      });
    });

    void auditEmailAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "send",
      entityType: "email_message",
      entityId: message.id,
      meta: {
        threadId: threadRecord.id,
        providerMessageId: messageId ?? null,
        emailAccountId: emailAccount.id,
        attachments: outboundAttachments.length,
        isReply: Boolean(replyCtx),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        threadId: threadRecord.id,
        messageId: message.id,
        providerMessageId: messageId,
      },
    });
  } catch (error) {
    captureEmailError(error, { scope: "send" });
    if (acceptedByGmail) {
      const accepted = acceptedByGmail;
      after(async () => {
        await Promise.allSettled(
          accepted.storageKeys.map((storageKey) => deleteFile(storageKey)),
        );
        await enqueueGmailSyncJob({
          tenantId: accepted.tenantId,
          emailAccountId: accepted.emailAccountId,
          reason: "send",
        }).catch(() => {});
        await processGmailSyncJob({
          emailAccountId: accepted.emailAccountId,
          profile: "delta",
          deadlineMs: Date.now() + 20_000,
        }).catch(() => {});
        await broadcastGmailMailboxChanged({
          tenantId: accepted.tenantId,
          userId: accepted.userId,
          reason: "send-reconcile",
          syncedCount: 1,
        });
      });
      return NextResponse.json(
        {
          success: true,
          warning:
            "Gmail aceptó el correo; OPAI completará el historial en la próxima sincronización.",
          data: {
            threadId: null,
            messageId: null,
            providerMessageId: accepted.providerMessageId,
            providerThreadId: accepted.providerThreadId,
          },
        },
        { status: 202 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      /Archivo demasiado grande|Archivo vacío|storage|adjunto/i.test(message)
    ) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }
    const e = error as { code?: number; status?: number; response?: { status?: number } };
    const status = e?.code ?? e?.status ?? e?.response?.status;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          success: false,
          error: "Gmail rechazó el envío (permisos). Reconectá tu casilla desde Integraciones.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el correo por Gmail" },
      { status: 502 }
    );
  }
}
