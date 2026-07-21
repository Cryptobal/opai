import { prisma } from "@/lib/prisma";
import { gmailClientForAccount, listThreadAttachments } from "./gmail-account-client";
import type { CorreoDetail, CorreoAttachmentDTO } from "./correos.types";

/** Detalle de un hilo: mensajes (cuerpos guardados) + adjuntos (metadata Gmail). */
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

  const [messages, account, deal, emailAccount] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { sentAt: "asc" },
      select: {
        id: true, direction: true, fromEmail: true, toEmails: true,
        subject: true, htmlBody: true, textBody: true, sentAt: true,
      },
    }),
    thread.accountId
      ? prisma.crmAccount.findFirst({ where: { id: thread.accountId, tenantId }, select: { name: true } })
      : null,
    thread.dealId
      ? prisma.crmDeal.findFirst({ where: { id: thread.dealId, tenantId }, select: { title: true } })
      : null,
    prisma.crmEmailAccount.findUnique({
      where: { id: emailAccountId },
      select: { accessTokenEncrypted: true, refreshTokenEncrypted: true },
    }),
  ]);

  let attachments: CorreoAttachmentDTO[] = [];
  if (thread.providerThreadId && emailAccount) {
    const gmail = gmailClientForAccount(emailAccount);
    if (gmail) {
      try {
        attachments = await listThreadAttachments(gmail, thread.providerThreadId);
      } catch (err) {
        console.error("[correos] listThreadAttachments falló:", err);
      }
    }
  }

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
  };
}
