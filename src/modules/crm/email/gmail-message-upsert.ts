import { prisma } from "@/lib/prisma";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";
import {
  extractGmailMessageBodies,
  extractGmailAttachments,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";
import { upsertLinkedThread } from "./thread-linking";
import { applyThreadLabelFlags } from "./gmail-thread-labels";
import type { EmailAccountLite } from "./gmail-sync-state";
import type { gmail_v1 } from "googleapis";

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function parseDateHeader(value: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Baja un mensaje Gmail (`format: full`), hace upsert del thread (con
 * emailAccountId + providerThreadId del dueño) y del mensaje. El thread se
 * persiste SIEMPRE, matchee o no un contacto. Devuelve true si escribió.
 */
export async function upsertGmailMessage(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  messageId: string;
  createdByUserId?: string | null;
}): Promise<boolean> {
  const { gmail, tenantId, emailAccount, messageId } = params;
  const existing = await prisma.crmEmailMessage.findFirst({
    where: { providerMessageId: messageId, tenantId },
  });
  const shouldBackfill = Boolean(existing) && !existing?.htmlBody && !existing?.textBody;

  const full = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: existing && !shouldBackfill ? "metadata" : "full",
    metadataHeaders: ["Subject", "From", "To", "Cc", "Bcc", "Date"],
  });
  const payload = full.data.payload;
  const headers = payload?.headers || [];
  const subject = getHeader(headers, "Subject") || "Sin asunto";
  const labelIds = full.data.labelIds || [];
  const direction = labelIds.includes("SENT") ? "out" : "in";
  const providerThreadId = full.data.threadId ?? null;

  if (existing && !shouldBackfill) {
    if (providerThreadId) {
      await applyThreadLabelFlags({
        tenantId,
        emailAccountId: emailAccount.id,
        providerThreadId,
        labelIds,
      });
    }
    return false;
  }
  const fromEmail =
    extractEmailAddresses(getHeader(headers, "From"))[0] ||
    normalizeEmailAddress(emailAccount.email);
  const toEmails = extractEmailAddresses(getHeader(headers, "To"));
  const ccEmails = extractEmailAddresses(getHeader(headers, "Cc"));
  const bccEmails = extractEmailAddresses(getHeader(headers, "Bcc"));
  const sentOrReceivedAt = parseDateHeader(getHeader(headers, "Date"));
  const { htmlBody, textBody } = extractGmailMessageBodies(payload as GmailMessagePart | undefined);
  const snippet = full.data.snippet?.trim() || null;

  const common = {
    direction,
    fromEmail,
    toEmails,
    ccEmails,
    bccEmails,
    subject,
    htmlBody,
    textBody: textBody || snippet,
    sentAt: sentOrReceivedAt,
    receivedAt: direction === "in" ? sentOrReceivedAt : null,
    status: direction === "out" ? "sent" : "received",
    source: "gmail",
    emailAccountId: emailAccount.id,
  };

  if (existing) {
    await prisma.crmEmailMessage.update({ where: { id: existing.id }, data: common });
    if (providerThreadId) {
      await applyThreadLabelFlags({
        tenantId,
        emailAccountId: emailAccount.id,
        providerThreadId,
        labelIds,
      });
    }
    return true;
  }

  const ownEmail = normalizeEmailAddress(emailAccount.email);
  const counterpartyEmails = [fromEmail, ...toEmails, ...ccEmails].filter(
    (e) => e && normalizeEmailAddress(e) !== ownEmail,
  );
  const thread = await upsertLinkedThread({
    tenantId,
    subject,
    lastMessageAt: sentOrReceivedAt,
    counterpartyEmails,
    emailAccountId: emailAccount.id,
    providerThreadId,
  });

  await prisma.crmEmailMessage.create({
    data: {
      tenantId,
      threadId: thread.id,
      providerMessageId: messageId,
      createdBy: params.createdByUserId ?? emailAccount.userId,
      ...common,
    },
  });

  if (providerThreadId) {
    await applyThreadLabelFlags({
      tenantId,
      emailAccountId: emailAccount.id,
      providerThreadId,
      labelIds,
    });
  }
  const attachments = extractGmailAttachments(payload as GmailMessagePart | undefined).length;
  if (attachments > 0) {
    await prisma.crmEmailThread.update({
      where: { id: thread.id },
      data: { attachmentCount: { increment: attachments } },
    });
  }
  return true;
}
