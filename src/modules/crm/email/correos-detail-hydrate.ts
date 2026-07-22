import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { extractGmailMessageBodies, type GmailMessagePart } from "@/lib/gmail-message-content";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";

function header(msg: gmail_v1.Schema$Message, name: string): string {
  const headers = msg.payload?.headers ?? [];
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

/**
 * Hidrata los mensajes del hilo que existen en Gmail pero no localmente, a
 * partir del `threads.get format:full` que el detalle YA baja para listar
 * adjuntos (cero requests extra). Los hilos importados por el sweep solo
 * persisten su último mensaje: sin esto, la cadena completa (incluidos los
 * enviados) no se veía al abrir el correo — a diferencia de Gmail.
 */
export async function hydrateMissingThreadMessages(params: {
  tenantId: string;
  threadId: string;
  emailAccountId: string;
  /** Dueño de la casilla: autor de los registros hidratados. */
  accountUserId: string;
  ownEmail: string;
  messages: gmail_v1.Schema$Message[];
}): Promise<number> {
  const { tenantId, threadId } = params;
  const ids = params.messages.map((m) => m.id).filter((v): v is string => Boolean(v));
  if (ids.length === 0) return 0;

  const existing = await prisma.crmEmailMessage.findMany({
    where: { tenantId, providerMessageId: { in: ids } },
    select: { providerMessageId: true },
  });
  const have = new Set(existing.map((e) => e.providerMessageId));
  const own = normalizeEmailAddress(params.ownEmail);

  let created = 0;
  for (const m of params.messages) {
    if (!m.id || have.has(m.id)) continue;
    const labelIds = m.labelIds ?? [];
    const fromEmail = extractEmailAddresses(header(m, "From"))[0] || "";
    const direction =
      labelIds.includes("SENT") || (fromEmail && normalizeEmailAddress(fromEmail) === own)
        ? "out"
        : "in";
    const sentAt = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
    const { htmlBody, textBody } = extractGmailMessageBodies(
      m.payload as GmailMessagePart | undefined,
    );
    await prisma.crmEmailMessage.create({
      data: {
        tenantId,
        threadId,
        providerMessageId: m.id,
        createdBy: params.accountUserId,
        direction,
        fromEmail: fromEmail || params.ownEmail,
        toEmails: extractEmailAddresses(header(m, "To")),
        ccEmails: extractEmailAddresses(header(m, "Cc")),
        bccEmails: [],
        subject: header(m, "Subject") || "Sin asunto",
        htmlBody,
        textBody: textBody || m.snippet?.trim() || null,
        sentAt,
        receivedAt: direction === "in" ? sentAt : null,
        status: direction === "out" ? "sent" : "received",
        source: "gmail",
        emailAccountId: params.emailAccountId,
        labelIds,
      },
    });
    created += 1;
  }
  return created;
}
