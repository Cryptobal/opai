/**
 * Construcción de mensajes 'user' multimodales para IA con visión, compartida
 * por todos los transportes (Slack runner y chat web streaming).
 *
 * Sin attachments → string simple (comportamiento actual). Con attachments →
 * content multimodal en el shape del proveedor activo (OpenAI/Anthropic/Google).
 */

export type ProviderType = "openai" | "anthropic" | "google";

export interface MultimodalAttachment {
  mimeType: string;
  dataBase64: string;
  name?: string;
}

const VALID_ATTACHMENT_RE = /^image\/(png|jpe?g|webp|gif)$/;

export function buildUserMessage(
  text: string,
  attachments: MultimodalAttachment[] | undefined,
  provider: ProviderType,
): Record<string, unknown> {
  const valid = (attachments ?? []).filter(
    (a) => VALID_ATTACHMENT_RE.test(a.mimeType) || a.mimeType === "application/pdf",
  );
  if (valid.length === 0) return { role: "user", content: text };

  if (provider === "anthropic") {
    const parts: Array<Record<string, unknown>> = [{ type: "text", text }];
    for (const a of valid) {
      parts.push(
        a.mimeType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: a.mimeType, data: a.dataBase64 } }
          : { type: "image", source: { type: "base64", media_type: a.mimeType, data: a.dataBase64 } },
      );
    }
    return { role: "user", content: parts };
  }
  if (provider === "google") {
    const parts: Array<Record<string, unknown>> = [{ text }];
    for (const a of valid) parts.push({ inline_data: { mime_type: a.mimeType, data: a.dataBase64 } });
    return { role: "user", content: parts };
  }
  const parts: Array<Record<string, unknown>> = [{ type: "text", text }];
  for (const a of valid) {
    parts.push(
      a.mimeType === "application/pdf"
        ? { type: "text", text: `[Adjunto PDF '${a.name ?? "documento"}' no procesable por este modelo; su texto ya fue extraído e inyectado como contexto si fue posible.]` }
        : { type: "image_url", image_url: { url: `data:${a.mimeType};base64,${a.dataBase64}` } },
    );
  }
  return { role: "user", content: parts };
}
