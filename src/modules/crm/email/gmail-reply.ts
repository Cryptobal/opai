import { prisma } from "@/lib/prisma";
import type { gmail_v1 } from "googleapis";

export type ReplyContext = {
  threadId: string;
  firstReplyAt: Date | null;
  /** threadId de la Gmail API para agrupar la respuesta en el mismo hilo. */
  gmailThreadId: string | null;
  /** Header RFC822 Message-ID del último inbound (In-Reply-To). */
  inReplyTo: string | null;
  references: string | null;
};

/**
 * Resuelve el contexto para responder DENTRO de un hilo existente: el threadId
 * de Gmail (agrupación) y los headers In-Reply-To/References tomados del último
 * mensaje entrante (se leen on-the-fly; el RFC Message-ID no se persiste).
 * Degrada elegante: si no hay headers, Gmail agrupa igual por threadId.
 */
export async function resolveReplyContext(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  threadId: string;
}): Promise<ReplyContext | null> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: params.threadId, tenantId: params.tenantId },
    select: { id: true, firstReplyAt: true, providerThreadId: true },
  });
  if (!thread) return null;

  const parent = await prisma.crmEmailMessage.findFirst({
    where: {
      threadId: thread.id,
      tenantId: params.tenantId,
      direction: "in",
      providerMessageId: { not: null },
    },
    orderBy: { sentAt: "desc" },
    select: { providerMessageId: true },
  });

  let inReplyTo: string | null = null;
  let references: string | null = null;
  if (parent?.providerMessageId) {
    try {
      const meta = await params.gmail.users.messages.get({
        userId: "me",
        id: parent.providerMessageId,
        format: "metadata",
        metadataHeaders: ["Message-ID", "References"],
      });
      const headers = meta.data.payload?.headers || [];
      const get = (n: string) =>
        headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value || null;
      inReplyTo = get("Message-ID");
      references = [get("References"), inReplyTo].filter(Boolean).join(" ") || null;
    } catch {
      /* sin headers: Gmail agrupa igual por threadId */
    }
  }

  return {
    threadId: thread.id,
    firstReplyAt: thread.firstReplyAt,
    gmailThreadId: thread.providerThreadId,
    inReplyTo,
    references,
  };
}
