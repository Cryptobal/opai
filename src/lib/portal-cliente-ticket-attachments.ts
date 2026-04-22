/**
 * Helpers para manejar adjuntos de tickets del portal cliente (PR5).
 *
 * Los adjuntos se guardan como JSON en `OpsTicketComment.attachments`.
 * Este módulo define el shape público y lo valida antes de persistir
 * para evitar que el cliente inyecte campos arbitrarios.
 */

export interface TicketAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

const MAX_ATTACHMENTS = 5;

export function normalizeTicketAttachments(raw: unknown): TicketAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: TicketAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
    const fileName = typeof o.fileName === "string" ? o.fileName.trim() : "";
    const fileUrl = typeof o.fileUrl === "string" ? o.fileUrl.trim() : "";
    const fileType =
      typeof o.fileType === "string" && o.fileType.length > 0
        ? o.fileType
        : "application/octet-stream";
    const fileSize =
      typeof o.fileSize === "number" && Number.isFinite(o.fileSize)
        ? Math.max(0, Math.floor(o.fileSize))
        : 0;

    if (!id || !fileName || !fileUrl) continue;
    // Sanity: solo URLs absolutas https:// (o data inline se rechaza).
    if (!/^https?:\/\//i.test(fileUrl)) continue;
    if (out.length >= MAX_ATTACHMENTS) break;
    out.push({ id, fileName, fileUrl, fileType, fileSize });
  }
  return out;
}
