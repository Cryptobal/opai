/**
 * Núcleo del envío por Gmail, extraído de /api/crm/gmail/send para que el
 * outbox (PR-12) y el envío directo (flag de rollback) compartan una sola
 * implementación: firma idempotente, adjuntos staged, MIME, threading,
 * registro en BD, frecency de destinatarios, audit log y realtime.
 *
 * Los inputs llegan YA validados y normalizados (ownership de adjuntos,
 * emails normalizados, casilla resuelta) — eso ocurre al encolar/en el route.
 */
import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress } from "@/lib/email-address";
import { deleteFile } from "@/lib/storage";
import { auditEmailAction } from "@/lib/audit-email";
import { resolveReplyContext } from "./gmail-reply";
import { gmailClientForAccount } from "./gmail-account-client";
import { buildGmailRawMessage } from "./gmail-mime";
import {
  MAX_EMAIL_ATTACHMENT_BYTES,
  MAX_GMAIL_RAW_MESSAGE_BYTES,
  isBlockedEmailAttachment,
  type StagedEmailAttachment,
} from "./gmail-outbound-attachments";
import {
  getStagedEmailFileBuffer,
  getStagedEmailFileMetadata,
} from "./gmail-staging-storage";
import { upsertLinkedThread } from "./thread-linking";
import { broadcastGmailMailboxChanged } from "./gmail-realtime";
import { enqueueGmailSyncJob, processGmailSyncJob } from "./gmail-sync-queue";
import { captureEmailError } from "./email-observability";
import { recordRecipients } from "./email-recipients";
import { appendSignatureOnce } from "./email-signature";

export type GmailSendInput = {
  tenantId: string;
  userId: string;
  userEmail: string | null;
  emailAccountId: string;
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
};

export type GmailSendResult =
  | {
      ok: true;
      threadId: string | null;
      messageId: string | null;
      providerMessageId: string | null;
      /** true si Gmail aceptó pero la BD falló: el sync reconciliará. */
      reconciled: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
      /** true si vale la pena reintentar (red/5xx/429); false si es definitivo. */
      retryable: boolean;
    };

function errorHttpStatus(error: unknown): number | null {
  const e = error as { code?: number; status?: number; response?: { status?: number } };
  const status = e?.code ?? e?.status ?? e?.response?.status;
  return typeof status === "number" ? status : null;
}

/** Firma default del usuario (o del tenant) para inyectar en el HTML saliente. */
async function resolveDefaultSignature(tenantId: string, userId: string) {
  try {
    const own = await prisma.crmEmailSignature.findFirst({
      where: { tenantId, userId, isDefault: true, isActive: true },
    });
    const sig =
      own ??
      (await prisma.crmEmailSignature.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      }));
    return sig?.htmlContent ? { id: sig.id, html: sig.htmlContent } : null;
  } catch (error) {
    console.error("Error cargando firma:", error);
    return null;
  }
}

/**
 * Ejecuta el envío completo. NUNCA lanza: siempre devuelve GmailSendResult.
 * Los efectos secundarios (frecency, audit, broadcast, limpieza de staged)
 * corren inline — quien llama ya respondió al usuario (outbox) o los espera.
 */
export async function performGmailSend(input: GmailSendInput): Promise<GmailSendResult> {
  let acceptedByGmail: {
    providerMessageId: string | null;
    providerThreadId: string | null;
  } | null = null;
  const storageKeys = input.attachments.map((a) => a.storageKey);
  try {
    const emailAccount = await prisma.crmEmailAccount.findFirst({
      where: {
        id: input.emailAccountId,
        tenantId: input.tenantId,
        provider: "gmail",
        status: "active",
      },
    });
    if (!emailAccount?.accessTokenEncrypted) {
      return { ok: false, status: 400, error: "Gmail no conectado", retryable: false };
    }

    const outboundAttachments: Array<{
      fileName: string;
      mimeType: string;
      content: Buffer;
    }> = [];
    let actualAttachmentBytes = 0;
    for (const attachment of input.attachments) {
      if (isBlockedEmailAttachment(attachment.fileName, attachment.mimeType)) {
        return {
          ok: false,
          status: 400,
          error: `Gmail no permite adjuntar “${attachment.fileName}”`,
          retryable: false,
        };
      }
      const metadata = await getStagedEmailFileMetadata(attachment.storageKey);
      if (
        metadata.size !== attachment.size ||
        !metadata.eTag ||
        metadata.mimeType !== attachment.mimeType ||
        actualAttachmentBytes + metadata.size > MAX_EMAIL_ATTACHMENT_BYTES
      ) {
        return {
          ok: false,
          status: 400,
          error: `La metadata de “${attachment.fileName}” no coincide con la subida`,
          retryable: false,
        };
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

    // ── Firma idempotente (R2): solo si el HTML no la contiene ya ──
    let finalHtml = input.html ?? "";
    let signatureId: string | null = null;
    const signature = await resolveDefaultSignature(input.tenantId, input.userId);
    if (signature) {
      const result = appendSignatureOnce(finalHtml, signature.html);
      finalHtml = result.html;
      signatureId = signature.id;
    }

    const gmail = gmailClientForAccount(emailAccount);
    if (!gmail) {
      return { ok: false, status: 400, error: "Gmail no conectado", retryable: false };
    }

    const replyCtx = input.threadId
      ? await resolveReplyContext({
          gmail,
          tenantId: input.tenantId,
          threadId: input.threadId,
        })
      : null;

    const raw = buildGmailRawMessage({
      from: emailAccount.email,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: finalHtml || undefined,
      text: finalHtml ? undefined : input.text ?? undefined,
      inReplyTo: replyCtx?.inReplyTo ?? undefined,
      references: replyCtx?.references ?? undefined,
      attachments: outboundAttachments,
    });
    if (Buffer.byteLength(raw, "base64url") > MAX_GMAIL_RAW_MESSAGE_BYTES) {
      return {
        ok: false,
        status: 400,
        error: "El mensaje completo supera el máximo de 35 MB de Gmail; reducí los adjuntos",
        retryable: false,
      };
    }

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(replyCtx?.gmailThreadId ? { threadId: replyCtx.gmailThreadId } : {}),
      },
    });

    const providerMessageId = response.data.id ?? null;
    const providerThreadId = response.data.threadId ?? replyCtx?.gmailThreadId ?? null;
    acceptedByGmail = { providerMessageId, providerThreadId };

    const sentAt = new Date();
    const threadRecord = replyCtx
      ? { id: replyCtx.threadId }
      : await upsertLinkedThread({
          tenantId: input.tenantId,
          subject: input.subject,
          lastMessageAt: sentAt,
          counterpartyEmails: [...input.to, ...input.cc],
          emailAccountId: emailAccount.id,
          providerThreadId,
          isInbound: false,
        });

    const messageData = {
      tenantId: input.tenantId,
      threadId: threadRecord.id,
      providerMessageId,
      direction: "out",
      fromEmail: normalizeEmailAddress(emailAccount.email),
      toEmails: input.to,
      ccEmails: input.cc,
      bccEmails: input.bcc,
      subject: input.subject,
      htmlBody: finalHtml || null,
      textBody: input.text,
      sentAt,
      createdBy: input.userId,
      status: "sent",
      source: "gmail",
      signatureId,
      emailAccountId: emailAccount.id,
      labelIds: ["SENT"],
    };
    const message = await prisma.$transaction(async (tx) => {
      const existingMessage = providerMessageId
        ? await tx.crmEmailMessage.findUnique({
            where: {
              emailAccountId_providerMessageId: {
                emailAccountId: emailAccount.id,
                providerMessageId,
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
          ...(input.accountId ? { accountId: input.accountId } : {}),
          ...(input.contactId ? { contactId: input.contactId } : {}),
          ...(input.dealId ? { dealId: input.dealId } : {}),
          ...(!existingMessage && outboundAttachments.length > 0
            ? { attachmentCount: { increment: outboundAttachments.length } }
            : {}),
          ...(replyCtx && !replyCtx.firstReplyAt ? { firstReplyAt: sentAt } : {}),
        },
      });

      return existingMessage
        ? tx.crmEmailMessage.update({
            where: { id: existingMessage.id },
            data: messageData,
          })
        : tx.crmEmailMessage.create({ data: messageData });
    });

    // ── Efectos post-envío (nunca lanzan) ──
    await Promise.allSettled(storageKeys.map((key) => deleteFile(key)));
    await recordRecipients({
      tenantId: input.tenantId,
      userId: input.userId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      sentAt,
    });
    await broadcastGmailMailboxChanged({
      tenantId: input.tenantId,
      userId: input.userId,
      reason: "send",
      syncedCount: 1,
    }).catch(() => {});
    void auditEmailAction({
      tenantId: input.tenantId,
      userId: input.userId,
      userEmail: input.userEmail,
      action: "send",
      entityType: "email_message",
      entityId: message.id,
      meta: {
        threadId: threadRecord.id,
        providerMessageId,
        emailAccountId: emailAccount.id,
        attachments: outboundAttachments.length,
        isReply: Boolean(replyCtx),
      },
    });

    return {
      ok: true,
      threadId: threadRecord.id,
      messageId: message.id,
      providerMessageId,
      reconciled: false,
    };
  } catch (error) {
    captureEmailError(error, { scope: "send" });
    if (acceptedByGmail) {
      // Gmail aceptó pero la BD falló: NO reintentar el envío (duplicaría).
      // El sync incremental reconcilia el historial.
      const accepted = acceptedByGmail;
      await Promise.allSettled(storageKeys.map((key) => deleteFile(key)));
      await enqueueGmailSyncJob({
        tenantId: input.tenantId,
        emailAccountId: input.emailAccountId,
        reason: "send",
      }).catch(() => {});
      await processGmailSyncJob({
        emailAccountId: input.emailAccountId,
        profile: "delta",
        deadlineMs: Date.now() + 20_000,
      }).catch(() => {});
      await broadcastGmailMailboxChanged({
        tenantId: input.tenantId,
        userId: input.userId,
        reason: "send-reconcile",
        syncedCount: 1,
      }).catch(() => {});
      return {
        ok: true,
        threadId: null,
        messageId: null,
        providerMessageId: accepted.providerMessageId,
        reconciled: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/Archivo demasiado grande|Archivo vacío|storage|adjunto/i.test(message)) {
      return { ok: false, status: 400, error: message, retryable: false };
    }
    const status = errorHttpStatus(error);
    if (status === 401 || status === 403) {
      return {
        ok: false,
        status: 403,
        error:
          "Gmail rechazó el envío (permisos). Reconectá tu casilla desde Integraciones.",
        retryable: false,
      };
    }
    if (status !== null && status >= 400 && status < 500 && status !== 429) {
      return {
        ok: false,
        status: 502,
        error: "Gmail rechazó el correo",
        retryable: false,
      };
    }
    return {
      ok: false,
      status: 502,
      error: "No se pudo enviar el correo por Gmail",
      retryable: true,
    };
  }
}
