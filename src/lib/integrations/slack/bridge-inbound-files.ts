/**
 * Ingesta de archivos de Slack → adjuntos del chat de OPAI (Fase 5).
 *
 * Descarga cada archivo con `files:read` (Bearer) y lo re-sube a R2 con el mismo
 * helper del chat (`uploadFile(..., "chat", tenantId)`), produciendo el shape
 * `ChatAttachment` que la UI ya renderiza — sin tocar el frontend. Límites:
 * máx 5 archivos, 10 MB c/u, sólo imágenes y PDF; el resto queda como link.
 */

import "server-only";
import { randomUUID } from "crypto";
import { uploadFile } from "@/lib/storage";
import { slackDownloadFile } from "./files";
import type { ChatAttachment } from "@/lib/chat-types";
import type { SlackFile } from "./bot";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

function isSupported(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}

export async function ingestSlackFiles(
  files: SlackFile[] | undefined,
  token: string,
  tenantId: string,
): Promise<{ attachments: ChatAttachment[]; links: string[] }> {
  const attachments: ChatAttachment[] = [];
  const links: string[] = [];

  for (const f of (files ?? []).slice(0, MAX_FILES)) {
    const mime = f.mimetype ?? "";
    const asLink = () => f.permalink && links.push(`📎 (archivo en Slack: ${f.permalink})`);

    if (!f.url_private || !isSupported(mime) || (f.size ?? 0) > MAX_BYTES) {
      asLink();
      continue;
    }
    try {
      const { buffer } = await slackDownloadFile(f.url_private, token);
      const uploaded = await uploadFile(buffer, f.name ?? "archivo", mime, "chat", tenantId);
      attachments.push({
        id: randomUUID(),
        fileName: uploaded.fileName,
        fileUrl: uploaded.publicUrl,
        fileType: uploaded.mimeType,
        fileSize: uploaded.size,
      });
    } catch (err) {
      console.error("[slack] no se pudo importar archivo de Slack:", err);
      asLink();
    }
  }

  return { attachments, links };
}
