import type { CorreoAttachmentDTO, CorreoMessageDTO } from "@/modules/crm/email/correos.types";

/**
 * Imágenes con Content-ID son embeds inline (firmas Outlook, logos), no
 * adjuntos que el usuario espera en "Adjuntos (N)".
 */
export function isListedAttachment(a: CorreoAttachmentDTO): boolean {
  if (a.contentId && a.mimeType.startsWith("image/")) return false;
  return true;
}

/** Adjuntos del mensaje (ids Gmail provider o id local del espejo). */
export function attachmentsForMessage(
  all: CorreoAttachmentDTO[],
  m: CorreoMessageDTO,
): CorreoAttachmentDTO[] {
  const keys = new Set<string>();
  if (m.providerMessageId) keys.add(m.providerMessageId);
  keys.add(m.id);
  return all.filter((a) => keys.has(a.messageId) && isListedAttachment(a));
}
