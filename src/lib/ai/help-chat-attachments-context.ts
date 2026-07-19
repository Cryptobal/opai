import { getFileBuffer } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import type { MultimodalAttachment } from "@/lib/ai/help-chat-multimodal";

/* Adjuntos del chat: visión (imágenes/PDF) + texto extraído (Excel/Word/PDF).
 * El texto de turnos previos ("hilo") llega ya cacheado en metadata y NO se
 * vuelve a bajar de R2 ni a re-parsear. Las imágenes del hilo sin texto sí se
 * re-bajan (acotado) para que la visión persista todo el hilo. */

const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif)$/;
const MULTIMODAL_MIME_RE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/;
const MAX_EXTRACT_CHARS = 12_000; // por archivo
const MAX_TOTAL_CONTEXT_CHARS = 24_000; // cap global de texto inyectado
const MAX_THREAD_IMAGES = 2; // imágenes del hilo re-subidas a visión (las más recientes)
const MAX_STAGED_BYTES = 10 * 1024 * 1024;

export type AttachmentRef = { stagedKey: string; fileName: string; mimeType: string };
export type ThreadAttachment = AttachmentRef & { extractedText?: string };

export type AttachmentsContextResult = {
  visionAttachments: MultimodalAttachment[];
  attachmentsContext: string | null;
  freshExtractions: Array<{ stagedKey: string; extractedText: string }>;
};

/**
 * Construye el contexto de adjuntos para un turno del chat combinando los
 * archivos del turno actual (`attachmentRefs`) con los de turnos anteriores del
 * hilo (`threadAttachments`). Devuelve la visión, el bloque de contexto textual
 * (manifiesto + texto extraído) y las extracciones frescas para cachear.
 */
export async function buildAttachmentsContext(params: {
  attachmentRefs: AttachmentRef[];
  threadAttachments: ThreadAttachment[];
}): Promise<AttachmentsContextResult> {
  const { attachmentRefs, threadAttachments } = params;
  const visionAttachments: MultimodalAttachment[] = [];
  const freshExtractions: Array<{ stagedKey: string; extractedText: string }> = [];
  const manifest: string[] = [];
  const extractedBlocks: string[] = [];
  let budget = MAX_TOTAL_CONTEXT_CHARS;

  function pushExtracted(fileName: string, text: string, suffix: string): void {
    const trimmed = text.trim();
    if (!trimmed || budget <= 0) return;
    const slice = trimmed.slice(0, budget);
    budget -= slice.length;
    extractedBlocks.push(`[Contenido extraído de '${fileName}'${suffix}]:\n${slice}`);
  }

  /* (a) Turno actual: baja de R2, arma visión y extrae texto (cacheable). */
  for (const ref of attachmentRefs) {
    let buffer: Buffer;
    try {
      buffer = await getFileBuffer(ref.stagedKey, MAX_STAGED_BYTES);
    } catch (err) {
      console.error("[help-chat] no se pudo leer adjunto staged:", err);
      continue;
    }
    manifest.push(`- ${ref.fileName} · ${ref.mimeType} · ${buffer.length} bytes · stagedKey=${ref.stagedKey}`);
    if (MULTIMODAL_MIME_RE.test(ref.mimeType)) {
      visionAttachments.push({ mimeType: ref.mimeType, dataBase64: buffer.toString("base64"), name: ref.fileName });
    }
    if (!IMAGE_MIME_RE.test(ref.mimeType)) {
      try {
        const text = (await extractText(buffer, ref.mimeType)).slice(0, MAX_EXTRACT_CHARS);
        if (text.trim()) {
          freshExtractions.push({ stagedKey: ref.stagedKey, extractedText: text });
          pushExtracted(ref.fileName, text, "");
        }
      } catch {
        /* mime no extraíble: la visión (si aplica) sigue disponible */
      }
    }
  }

  /* (b) Hilo (reciente → antiguo): texto cacheado directo; imágenes sin texto
   * se re-bajan (máx 2) para que la visión persista; el resto solo al manifiesto. */
  let threadImagesAdded = 0;
  for (const att of [...threadAttachments].reverse()) {
    manifest.push(
      `- ${att.fileName} · ${att.mimeType} · stagedKey=${att.stagedKey} (subido antes en esta conversación)`,
    );
    if (att.extractedText && att.extractedText.trim()) {
      pushExtracted(att.fileName, att.extractedText, " (subido antes en esta conversación)");
      continue;
    }
    if (IMAGE_MIME_RE.test(att.mimeType) && threadImagesAdded < MAX_THREAD_IMAGES) {
      try {
        const buffer = await getFileBuffer(att.stagedKey, MAX_STAGED_BYTES);
        visionAttachments.push({ mimeType: att.mimeType, dataBase64: buffer.toString("base64"), name: att.fileName });
        threadImagesAdded += 1;
      } catch (err) {
        console.error("[help-chat] no se pudo re-leer imagen del hilo:", err);
      }
    }
  }

  const blocks: string[] = [];
  if (manifest.length) {
    blocks.push(
      `El usuario adjuntó archivos ya almacenados en staging. Para adjuntar uno a una entidad (deal/cuenta/instalación/lead) usa attach_file_to_entity con su stagedKey EXACTO:\n${manifest.join("\n")}`,
    );
  }
  if (extractedBlocks.length) blocks.push(extractedBlocks.join("\n\n"));

  return {
    visionAttachments,
    attachmentsContext: blocks.length ? blocks.join("\n\n") : null,
    freshExtractions,
  };
}
