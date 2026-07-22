import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { extractGmailAttachments, type GmailMessagePart } from "@/lib/gmail-message-content";
import { gmailClientForAccount } from "./gmail-account-client";
import { hydrateMissingThreadMessages } from "./correos-detail-hydrate";
import { captureEmailError } from "./email-observability";
import type { CorreoDetail, CorreoAttachmentDTO } from "./correos.types";

/**
 * Detalle de un hilo: cadena completa de mensajes + adjuntos. Un solo
 * `threads.get format:full` alimenta ambos: la metadata de adjuntos y la
 * hidratación de mensajes que faltan localmente (hilos importados que solo
 * persistieron su último mensaje).
 */
export async function getCorreoDetail(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
}): Promise<CorreoDetail | null> {
  const { tenantId, emailAccountId, threadId } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: {
      id: true,
      subject: true,
      accountId: true,
      dealId: true,
      leadId: true,
      providerThreadId: true,
      isUnread: true,
      archivedAt: true,
    },
  });
  if (!thread) return null;

  const emailAccount = await prisma.crmEmailAccount.findUnique({
    where: { id: emailAccountId },
    select: { email: true, userId: true, accessTokenEncrypted: true, refreshTokenEncrypted: true },
  });

  let attachments: CorreoAttachmentDTO[] = [];
  // B3: si Gmail falla no devolvemos adjuntos vacíos en silencio — el hilo
  // sale con degraded=true y la UI muestra el aviso de reintento.
  let degraded = false;
  if (thread.providerThreadId && emailAccount) {
    const gmail = gmailClientForAccount(emailAccount);
    if (gmail) {
      try {
        const res = await gmail.users.threads.get({
          userId: "me",
          id: thread.providerThreadId,
          format: "full",
        });
        const gmailMessages: gmail_v1.Schema$Message[] = res.data.messages ?? [];
        for (const m of gmailMessages) {
          if (!m.id) continue;
          for (const att of extractGmailAttachments(m.payload as GmailMessagePart | undefined)) {
            attachments.push({ ...att, messageId: m.id });
          }
        }
        await hydrateMissingThreadMessages({
          tenantId,
          threadId: thread.id,
          emailAccountId,
          accountUserId: emailAccount.userId,
          ownEmail: emailAccount.email,
          messages: gmailMessages,
        });
      } catch (err) {
        degraded = true;
        captureEmailError(err, {
          scope: "detalle-hilo",
          tenantId,
          emailAccountId,
          threadId: thread.id,
        });
      }
    }
  }

  const [messages, account, deal] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { sentAt: "asc" },
      select: {
        id: true, direction: true, fromEmail: true, toEmails: true, ccEmails: true,
        subject: true, htmlBody: true, textBody: true, sentAt: true,
      },
    }),
    thread.accountId
      ? prisma.crmAccount.findFirst({ where: { id: thread.accountId, tenantId }, select: { name: true } })
      : null,
    thread.dealId
      ? prisma.crmDeal.findFirst({ where: { id: thread.dealId, tenantId }, select: { title: true } })
      : null,
  ]);

  return {
    thread: {
      id: thread.id,
      subject: thread.subject,
      accountId: thread.accountId,
      accountName: account?.name ?? null,
      dealId: thread.dealId,
      dealTitle: deal?.title ?? null,
      leadId: thread.leadId,
      providerThreadId: thread.providerThreadId,
      isUnread: thread.isUnread,
      archivedAt: thread.archivedAt?.toISOString() ?? null,
    },
    messages: messages.map((m) => ({ ...m, sentAt: m.sentAt?.toISOString() ?? null })),
    attachments,
    degraded,
  };
}
