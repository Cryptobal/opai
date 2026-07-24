import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import {
  extractGmailMessageBodiesAsync,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";
import {
  extractEmailAddresses,
  formatFromHeaderForStorage,
  normalizeEmailAddress,
} from "@/lib/email-address";

function header(msg: gmail_v1.Schema$Message, name: string): string {
  const headers = msg.payload?.headers ?? [];
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function attachmentFetcher(
  gmail: gmail_v1.Gmail | null | undefined,
  messageId: string,
): ((attachmentId: string) => Promise<string | null>) | undefined {
  if (!gmail) return undefined;
  return async (attachmentId: string) => {
    try {
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachmentId,
      });
      return res.data.data ?? null;
    } catch (err) {
      console.warn("[correos] attachment body fetch failed:", messageId, attachmentId, err);
      return null;
    }
  };
}

/**
 * Hidrata los mensajes del hilo desde un `threads.get format:full`:
 *  - crea los que existen en Gmail y no localmente;
 *  - reasigna al hilo actual los que viven en otro threadId (huérfanos);
 *  - backfillea cuerpos vacíos (html/text) — el sync a veces guardó el
 *    mensaje sin body cuando Gmail solo dejó `attachmentId`.
 *
 * Sin esto, la bandeja muestra hilos con "?" / sin snippet y el detalle
 * "Sin mensajes." aunque Gmail sí tenga el correo.
 */
export async function hydrateMissingThreadMessages(params: {
  tenantId: string;
  threadId: string;
  emailAccountId: string;
  /** Dueño de la casilla: autor de los registros hidratados. */
  accountUserId: string;
  ownEmail: string;
  messages: gmail_v1.Schema$Message[];
  /** Cliente Gmail para resolver cuerpos que solo vienen como attachmentId. */
  gmail?: gmail_v1.Gmail | null;
}): Promise<number> {
  const { tenantId, threadId } = params;
  const ids = params.messages.map((m) => m.id).filter((v): v is string => Boolean(v));
  if (ids.length === 0) return 0;

  const existing = await prisma.crmEmailMessage.findMany({
    where: { tenantId, providerMessageId: { in: ids } },
    select: {
      id: true,
      providerMessageId: true,
      threadId: true,
      htmlBody: true,
      textBody: true,
      fromEmail: true,
    },
  });
  const byProvider = new Map(
    existing
      .filter((e): e is typeof e & { providerMessageId: string } => Boolean(e.providerMessageId))
      .map((e) => [e.providerMessageId, e]),
  );
  const own = normalizeEmailAddress(params.ownEmail);

  let touched = 0;
  for (const m of params.messages) {
    if (!m.id) continue;
    const labelIds = m.labelIds ?? [];
    const rawFrom = header(m, "From");
    const fromEmail = formatFromHeaderForStorage(rawFrom, params.ownEmail);
    const fromAddr = extractEmailAddresses(rawFrom)[0] || "";
    const direction =
      labelIds.includes("SENT") || (fromAddr && normalizeEmailAddress(fromAddr) === own)
        ? "out"
        : "in";
    const sentAt = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
    const { htmlBody, textBody } = await extractGmailMessageBodiesAsync(
      m.payload as GmailMessagePart | undefined,
      attachmentFetcher(params.gmail, m.id),
    );
    const resolvedText = textBody || m.snippet?.trim() || null;
    const common = {
      direction,
      fromEmail,
      toEmails: extractEmailAddresses(header(m, "To")),
      ccEmails: extractEmailAddresses(header(m, "Cc")),
      bccEmails: [] as string[],
      subject: header(m, "Subject") || "Sin asunto",
      htmlBody,
      textBody: resolvedText,
      sentAt,
      receivedAt: direction === "in" ? sentAt : null,
      status: direction === "out" ? "sent" : "received",
      source: "gmail",
      emailAccountId: params.emailAccountId,
      labelIds,
    };

    const row = byProvider.get(m.id);
    if (!row) {
      await prisma.crmEmailMessage.create({
        data: {
          tenantId,
          threadId,
          providerMessageId: m.id,
          createdBy: params.accountUserId,
          ...common,
        },
      });
      touched += 1;
      continue;
    }

    const emptyBody = !row.htmlBody && !row.textBody;
    const wrongThread = row.threadId !== threadId;
    const weakFrom = !row.fromEmail?.trim() || !row.fromEmail.includes("@");
    if (!emptyBody && !wrongThread && !weakFrom) continue;

    await prisma.crmEmailMessage.update({
      where: { id: row.id },
      data: {
        threadId,
        ...common,
        // No pisar un cuerpo ya bueno con null si el fetch falló.
        htmlBody: htmlBody || row.htmlBody,
        textBody: resolvedText || row.textBody,
      },
    });
    touched += 1;
  }
  return touched;
}
