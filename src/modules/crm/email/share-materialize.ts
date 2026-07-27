import { prisma } from "@/lib/prisma";
import { saveThreadAttachments } from "./save-attachments";
import type { CorreoAttachmentDTO } from "./correos.types";

/** Topes de materialización al compartir un hilo. */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB por archivo
const MAX_FILES = 5; // por hilo

/**
 * Materializa a R2 los adjuntos de un hilo recién compartido (Bloque 5, B7):
 * los persiste como CrmFile (`sourceType:"email"`, `sourceThreadId`) vinculados
 * a la cuenta, para que sigan disponibles desde la ficha aunque el dueño
 * desconecte Gmail o Google purgue el mensaje. Usa el token del DUEÑO (su
 * propia request). Dedupe por contentHash (omite los ya materializados). No
 * bloquea la asociación: el llamador la ejecuta con `void` + try/catch.
 */
export async function materializeSharedThreadAttachments(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  accountId: string;
}): Promise<void> {
  const { tenantId, userId, threadId, accountId } = params;
  try {
    const thread = await prisma.crmEmailThread.findFirst({
      where: { id: threadId, tenantId },
      select: { attachmentsMeta: true },
    });
    const meta = (thread?.attachmentsMeta as CorreoAttachmentDTO[] | null) ?? [];
    const items = meta
      .filter((a) => a.size > 0 && a.size <= MAX_BYTES)
      .slice(0, MAX_FILES)
      .map((a) => ({ messageId: a.messageId, attachmentId: a.attachmentId, filename: a.filename, size: a.size }));
    if (items.length === 0) return;

    await saveThreadAttachments({
      tenantId,
      userId,
      threadId,
      entityType: "account",
      entityId: accountId,
      folderId: null,
      portalVisible: false,
      enqueueDrive: false,
      items,
      deadlineMs: Date.now() + 25_000,
    });
  } catch (err) {
    // El fallo de materialización nunca debe romper la asociación.
    console.error("[correos] materializar adjuntos compartidos falló:", err);
  }
}
