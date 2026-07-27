import { prisma } from "@/lib/prisma";
import { attachSavedFileIds } from "./attachment-saved";
import type { CorreoAttachmentDTO, EntityThreadDetail } from "./correos.types";

/**
 * Detalle de un hilo para el lector de la ficha (Bloque 5). Sirve SOLO desde el
 * espejo local (CrmEmailMessage + attachmentsMeta enriquecida con savedFileId);
 * NO instancia un cliente Gmail — usar el token del dueño para servir a un
 * tercero rompería la segregación y ataría la ficha a que no desconecte su
 * cuenta. Los adjuntos no materializados salen sin savedFileId ("pendiente de
 * sincronizar"). La autorización por entidad la resuelve el route ANTES.
 */
export async function getEntityThreadDetail(params: {
  tenantId: string;
  threadId: string;
  subject: string;
  attachmentsMeta: unknown;
}): Promise<EntityThreadDetail> {
  const { tenantId, threadId, subject, attachmentsMeta } = params;

  const messages = await prisma.crmEmailMessage.findMany({
    where: { threadId, tenantId },
    orderBy: { sentAt: "asc" },
    select: {
      id: true, direction: true, fromEmail: true, toEmails: true, ccEmails: true,
      subject: true, htmlBody: true, textBody: true, sentAt: true,
    },
  });

  const baseAttachments = (attachmentsMeta as CorreoAttachmentDTO[] | null) ?? [];
  const attachments = await attachSavedFileIds(tenantId, threadId, baseAttachments);

  return {
    thread: { id: threadId, subject },
    messages: messages.map((m) => ({ ...m, sentAt: m.sentAt?.toISOString() ?? null })),
    attachments,
    synced: messages.length > 0,
  };
}
