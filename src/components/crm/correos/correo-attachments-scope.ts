import type { CorreoAttachmentDTO, CorreoMessageDTO } from "@/modules/crm/email/correos.types";

/**
 * Imágenes con Content-ID son embeds inline (firmas Outlook, logos), no
 * adjuntos que el usuario espera en "Adjuntos (N)".
 */
export function isListedAttachment(a: CorreoAttachmentDTO): boolean {
  if (a.contentId && a.mimeType.startsWith("image/")) return false;
  return true;
}

/** Keys con las que el detalle asocia adjuntos al mensaje (Gmail o espejo). */
function messageAttachmentKeys(m: CorreoMessageDTO): Set<string> {
  const keys = new Set<string>();
  if (m.providerMessageId) keys.add(m.providerMessageId);
  keys.add(m.id);
  return keys;
}

/**
 * Todos los adjuntos del mensaje, incluidas imágenes inline (`cid:` / Content-ID).
 * Usar para reescribir `src="cid:…"` en el HTML del lector.
 */
export function allAttachmentsForMessage(
  all: CorreoAttachmentDTO[],
  m: CorreoMessageDTO,
): CorreoAttachmentDTO[] {
  const keys = messageAttachmentKeys(m);
  return all.filter((a) => keys.has(a.messageId));
}

/**
 * Adjuntos listables del mensaje (sin embeds inline). Ids Gmail provider o
 * id local del espejo. Para el bloque "Adjuntos (N)" / paperclip.
 */
export function attachmentsForMessage(
  all: CorreoAttachmentDTO[],
  m: CorreoMessageDTO,
): CorreoAttachmentDTO[] {
  return allAttachmentsForMessage(all, m).filter(isListedAttachment);
}
