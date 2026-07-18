/**
 * Preparación de adjuntos del bot de Slack:
 *  - Descarga binarios (imágenes/PDF/Excel/Word/CSV) con el token del bot.
 *  - Sube cada uno a R2 como "staged" (prefix chat-staged) para que la tool
 *    attach_file_to_entity pueda adjuntarlo a una entidad SIN cargar el binario
 *    en los args del pending (solo viaja la stagedKey).
 *  - Imágenes y PDF van además como bloques multimodales (visión).
 *  - Excel/Word/CSV/PDF: texto extraído server-side (extractText) e inyectado como contexto.
 */
import { slackDownloadFile } from "./files";
import { uploadFile } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import type { SlackFile } from "./bot";

const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif)$/;
const MULTIMODAL_MIME_RE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/;
const MAX_EXTRACT_CHARS = 12_000;

export interface PreparedAttachments {
  multimodal: Array<{ mimeType: string; dataBase64: string; name?: string }>;
  contextHint?: string;
  extractedContext?: string;
}

export async function prepareSlackAttachments(
  files: SlackFile[],
  botToken: string,
  tenantId: string,
): Promise<PreparedAttachments> {
  const multimodal: PreparedAttachments["multimodal"] = [];
  const manifest: string[] = [];
  const extracted: string[] = [];

  for (const f of files) {
    if (!f.url_private) continue;
    let buffer: Buffer;
    let contentType: string;
    try {
      const dl = await slackDownloadFile(f.url_private, botToken);
      buffer = dl.buffer;
      contentType = f.mimetype && f.mimetype !== "application/octet-stream" ? f.mimetype : dl.contentType;
    } catch (err) {
      console.error("[slack] descarga de adjunto falló:", err);
      continue;
    }
    const name = f.name ?? "archivo";

    let stagedKey: string | null = null;
    try {
      const up = await uploadFile(buffer, name, contentType, "chat-staged", tenantId);
      stagedKey = up.storageKey ?? null;
    } catch (err) {
      console.error("[slack] staging R2 falló:", err);
    }
    if (stagedKey) {
      manifest.push(`- ${name} · ${contentType} · ${buffer.length} bytes · stagedKey=${stagedKey}`);
    }

    if (MULTIMODAL_MIME_RE.test(contentType)) {
      multimodal.push({ mimeType: contentType, dataBase64: buffer.toString("base64"), name });
    }

    if (!IMAGE_MIME_RE.test(contentType)) {
      try {
        const text = (await extractText(buffer, contentType)).slice(0, MAX_EXTRACT_CHARS);
        if (text.trim()) extracted.push(`[Contenido extraído de '${name}']:\n${text}`);
      } catch {
        // mime no extraíble: la visión (si aplica) sigue disponible.
      }
    }
  }

  return {
    multimodal,
    contextHint: manifest.length
      ? `El usuario adjuntó archivos ya almacenados en staging. Para adjuntar uno a una entidad (deal/cuenta/instalación/lead) usa attach_file_to_entity con su stagedKey EXACTO:\n${manifest.join("\n")}`
      : undefined,
    extractedContext: extracted.length ? extracted.join("\n\n") : undefined,
  };
}
