import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import { fetchGmailAttachment } from "./gmail-attachment";

export type SaveAttachmentItem = {
  messageId: string;
  attachmentId: string;
  filename?: string | null;
  size?: number | null;
};

export type SaveEntityType = "deal" | "account" | "installation";

export type SaveAttachmentResult = {
  filename: string;
  status: "saved" | "already" | "error";
  fileId?: string;
  error?: string;
};

/**
 * Normaliza el body del endpoint a una lista de ítems. Acepta el shape nuevo
 * (`items[]`) y el legacy de un solo adjunto (`messageId`/`attachmentId`
 * sueltos) → lista de largo 1. Función pura (testeable).
 */
export function normalizeSaveItems(body: {
  items?: unknown;
  messageId?: unknown;
  attachmentId?: unknown;
  filename?: unknown;
  size?: unknown;
}): SaveAttachmentItem[] {
  const raw = Array.isArray(body.items) ? body.items : [];
  const fromArray = raw
    .map((it) => (it && typeof it === "object" ? (it as Record<string, unknown>) : {}))
    .filter((it) => typeof it.messageId === "string" && typeof it.attachmentId === "string")
    .map((it) => ({
      messageId: it.messageId as string,
      attachmentId: it.attachmentId as string,
      filename: typeof it.filename === "string" ? it.filename : null,
      size: typeof it.size === "number" ? it.size : null,
    }));
  if (fromArray.length > 0) return fromArray;

  if (typeof body.messageId === "string" && typeof body.attachmentId === "string") {
    return [
      {
        messageId: body.messageId,
        attachmentId: body.attachmentId,
        filename: typeof body.filename === "string" ? body.filename : null,
        size: typeof body.size === "number" ? body.size : null,
      },
    ];
  }
  return [];
}

/**
 * Guarda N adjuntos de un hilo Gmail como Documentos de una entidad CRM.
 *
 * - Serial (no Promise.all): no satura la cuota de Gmail ni la memoria del
 *   runtime; respeta un deadline y devuelve resultado parcial si se corta.
 * - Dedupe por `contentHash` (sha256) SIEMPRE dentro del tenant: si el binario
 *   ya existe como CrmFile se reutiliza el objeto R2 y solo se crea el
 *   CrmFileLink faltante (mismo archivo en cuenta y negocio → 1 objeto, 2 links).
 * - Persiste procedencia (`sourceType:"email"`, `sourceThreadId`,
 *   `sourceMessageId`) en los objetos nuevos.
 * - `enqueueDrive` (destino negocio): espeja a Drive por cada link nuevo.
 */
export async function saveThreadAttachments(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  entityType: SaveEntityType;
  entityId: string;
  folderId: string | null;
  portalVisible: boolean;
  enqueueDrive: boolean;
  items: SaveAttachmentItem[];
  /** Epoch ms tras el cual no se procesan más ítems (se devuelven como error). */
  deadlineMs?: number;
}): Promise<SaveAttachmentResult[]> {
  const { tenantId, userId, threadId, entityType, entityId, folderId, portalVisible, enqueueDrive, items } = params;
  const results: SaveAttachmentResult[] = [];

  for (const item of items) {
    const label = item.filename || "adjunto";
    if (params.deadlineMs && Date.now() > params.deadlineMs) {
      results.push({ filename: label, status: "error", error: "No procesado (tiempo agotado); reintentá" });
      continue;
    }

    const att = await fetchGmailAttachment({
      tenantId,
      userId,
      threadId,
      messageId: item.messageId,
      attachmentId: item.attachmentId,
      filenameHint: item.filename ?? null,
      sizeHint: typeof item.size === "number" && item.size > 0 ? item.size : null,
    });
    if (!att.ok) {
      results.push({ filename: label, status: "error", error: att.error });
      continue;
    }

    try {
      const contentHash = createHash("sha256").update(att.buffer).digest("hex");

      // Dedupe: reutilizar el objeto si el binario ya existe en el tenant.
      const existing = await prisma.crmFile.findFirst({
        where: { tenantId, contentHash },
        select: { id: true, storageKey: true, fileName: true, mimeType: true },
      });

      let fileId: string;
      let file: { id: string; storageKey: string; fileName: string; mimeType: string };
      if (existing) {
        fileId = existing.id;
        file = existing;
      } else {
        const uploaded = await uploadFile(att.buffer, att.filename, att.mimeType, "crm", tenantId);
        const created = await prisma.crmFile.create({
          data: {
            tenantId,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            storageProvider: STORAGE_PROVIDER,
            storageKey: uploaded.storageKey,
            createdBy: userId,
            portalVisible,
            sourceType: "email",
            sourceThreadId: threadId,
            sourceMessageId: item.messageId,
            contentHash,
          },
          select: { id: true, storageKey: true, fileName: true, mimeType: true },
        });
        fileId = created.id;
        file = created;
      }

      // Idempotencia por entidad: si ya está vinculado, no duplicar el link.
      const existingLink = await prisma.crmFileLink.findFirst({
        where: { tenantId, entityType, entityId, fileId },
        select: { id: true },
      });
      if (existingLink) {
        results.push({ filename: att.filename, status: "already", fileId });
        continue;
      }

      await prisma.crmFileLink.create({
        data: { tenantId, fileId, entityType, entityId, folderId: folderId ?? null },
      });

      // Espejo a la carpeta Drive del negocio (cuentas/instalaciones no se
      // espejan). No bloquea la respuesta.
      if (enqueueDrive) {
        void enqueueCrmFileToDrive({
          tenantId,
          entityType: "deal",
          entityId,
          file: { id: file.id, storageKey: file.storageKey, fileName: file.fileName, mimeType: file.mimeType },
        });
      }

      results.push({ filename: att.filename, status: "saved", fileId });
    } catch (err) {
      console.error("[correos] guardar adjunto falló:", err);
      results.push({ filename: att.filename, status: "error", error: "No se pudo guardar" });
    }
  }

  return results;
}
