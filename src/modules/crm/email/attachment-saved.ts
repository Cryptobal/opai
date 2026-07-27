import { prisma } from "@/lib/prisma";
import type { CorreoAttachmentDTO } from "./correos.types";

/**
 * Enriquece los adjuntos de un hilo con `savedFileId` (chip "Guardado"):
 * consulta fresca de CrmFile por `sourceThreadId` y match por messageId +
 * fileName (+ size cuando desempata). Se resuelve SIEMPRE en vivo, fuera de
 * `attachmentsMeta`, para que un guardado posterior al cacheo aparezca sin
 * invalidar el caché C18. Compartido por el lector de Correos y el de la ficha.
 */
export async function attachSavedFileIds(
  tenantId: string,
  threadId: string,
  attachments: CorreoAttachmentDTO[],
): Promise<CorreoAttachmentDTO[]> {
  if (attachments.length === 0) return [];
  const savedFiles = await prisma.crmFile.findMany({
    where: { tenantId, sourceThreadId: threadId },
    select: { id: true, fileName: true, size: true, sourceMessageId: true },
  });
  return attachments.map((a) => {
    const candidates = savedFiles.filter(
      (f) => f.sourceMessageId === a.messageId && f.fileName === a.filename,
    );
    const match = candidates.find((f) => f.size === a.size) ?? candidates[0];
    return { ...a, savedFileId: match?.id ?? null };
  });
}
