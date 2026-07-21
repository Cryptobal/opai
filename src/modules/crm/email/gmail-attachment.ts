import { prisma } from "@/lib/prisma";
import { gmailClientForAccount } from "./gmail-account-client";
import { extractGmailAttachments, type GmailMessagePart } from "@/lib/gmail-message-content";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export type GmailAttachmentResult =
  | { ok: true; buffer: Buffer; filename: string; mimeType: string; size: number }
  | { ok: false; status: number; error: string };

/**
 * Descarga un adjunto de un hilo Gmail vía streaming. Valida tenant + propiedad
 * de la casilla (del usuario) + que el mensaje pertenece al hilo. filename y
 * mimeType se toman del payload real (autoritativo, nunca del cliente). Cap 25
 * MB → 413. Reutilizado por el endpoint de abrir/descargar (B4) y por guardar
 * en el negocio (B5).
 */
export async function fetchGmailAttachment(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  /** providerMessageId de Gmail. */
  messageId: string;
  attachmentId: string;
  /** Fallback de matching: los attachmentId de Gmail son efímeros (rotan
   *  entre llamadas); si el id listado ya venció, se re-ubica el adjunto por
   *  nombre (+tamaño) dentro del mensaje y se usa el id fresco. */
  filenameHint?: string | null;
  sizeHint?: number | null;
}): Promise<GmailAttachmentResult> {
  const { tenantId, userId, threadId, messageId, attachmentId } = params;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true, accessTokenEncrypted: true, refreshTokenEncrypted: true },
  });
  if (!account) return { ok: false, status: 400, error: "Gmail no conectado" };

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, providerThreadId: true },
  });
  if (!thread) return { ok: false, status: 404, error: "Hilo no encontrado" };
  if (!thread.providerThreadId) return { ok: false, status: 400, error: "Hilo sin Gmail" };

  const gmail = gmailClientForAccount(account);
  if (!gmail) return { ok: false, status: 400, error: "Gmail no conectado" };

  try {
    const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    // Autorización por pertenencia real al hilo (no por copia local): el token
    // es de la casilla del usuario, así que solo alcanza SU correo. Exigir un
    // CrmEmailMessage local rompía los adjuntos de hilos importados, donde solo
    // se persiste el último mensaje del hilo (los demás no tienen fila local).
    if (msg.data.threadId !== thread.providerThreadId) {
      return { ok: false, status: 404, error: "Mensaje no encontrado" };
    }
    const atts = extractGmailAttachments(msg.data.payload as GmailMessagePart | undefined);
    const meta =
      atts.find((a) => a.attachmentId === attachmentId) ??
      (params.filenameHint
        ? atts.find(
            (a) =>
              a.filename === params.filenameHint &&
              (params.sizeHint == null || a.size === params.sizeHint),
          )
        : undefined);
    if (!meta) return { ok: false, status: 404, error: "Adjunto no encontrado" };
    if (meta.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, status: 413, error: "Adjunto demasiado grande (máx 25 MB)" };
    }

    // Siempre el id fresco del mensaje recién bajado, nunca el listado stale.
    const att = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: meta.attachmentId,
    });
    const data = att.data.data;
    if (!data) return { ok: false, status: 404, error: "Adjunto vacío" };
    const buffer = Buffer.from(data, "base64url");
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return { ok: false, status: 413, error: "Adjunto demasiado grande (máx 25 MB)" };
    }

    return { ok: true, buffer, filename: meta.filename, mimeType: meta.mimeType, size: buffer.byteLength };
  } catch (err) {
    const e = err as { code?: number; status?: number; response?: { status?: number } };
    const status = e?.code ?? e?.status ?? e?.response?.status;
    if (status === 404) return { ok: false, status: 404, error: "Mensaje no encontrado" };
    console.error("[correos] fetchGmailAttachment falló:", err);
    return { ok: false, status: 502, error: "No se pudo descargar el adjunto" };
  }
}
