/**
 * Construcción del mensaje saliente OPAI → Slack con adjuntos (Fase 5).
 *
 * Los `fileUrl` del chat son URLs públicas y estables (R2 `files.gard.cl`), así
 * que las imágenes se muestran nativamente con `image` blocks apuntando directo
 * a la URL — sin re-subir el binario. Los no-imagen siguen como link `📎`.
 */

const MAX_IMAGE_BLOCKS = 10;

export interface BridgeAttachment {
  url: string;
  name: string;
  isImage: boolean;
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//.test(v);
}

/** Normaliza el shape real de ChatAttachment ({fileUrl, fileType, fileName}). */
export function parseOutboundAttachments(attachments: unknown): BridgeAttachment[] {
  if (!Array.isArray(attachments)) return [];
  const out: BridgeAttachment[] = [];
  for (const a of attachments) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const url = o.fileUrl ?? o.url; // fileUrl es el campo real; url por compat
    if (!isHttpUrl(url)) continue;
    const name = (o.fileName ?? o.name) as string | undefined;
    const type = (o.fileType ?? o.mimeType ?? o.type) as string | undefined;
    out.push({ url, name: name || "archivo", isImage: (type ?? "").startsWith("image/") });
  }
  return out;
}

/**
 * Arma `{ text, blocks? }` para chat.postMessage. Con imágenes devuelve blocks
 * (texto + image blocks + links de no-imagen) y `text` como fallback de
 * notificación. Sin imágenes devuelve solo texto con links 📎. `identityPrefix`
 * se antepone cuando falta `chat:write.customize` (fallback sin identidad).
 */
export function buildOutboundMessage(
  text: string,
  atts: BridgeAttachment[],
  identityPrefix = "",
): { text: string; blocks?: unknown[] } {
  const images = atts.filter((a) => a.isImage).slice(0, MAX_IMAGE_BLOCKS);
  const files = atts.filter((a) => !a.isImage);
  const fileLinks = files.map((a) => `📎 <${a.url}|${a.name}>`);
  const lead = `${identityPrefix}${text}`.trim();

  if (images.length === 0) {
    const full = [lead, ...fileLinks].filter(Boolean).join("\n");
    return { text: full || "(mensaje sin texto)" };
  }

  const blocks: unknown[] = [];
  if (lead) blocks.push({ type: "section", text: { type: "mrkdwn", text: lead } });
  for (const img of images) {
    blocks.push({ type: "image", image_url: img.url, alt_text: img.name.slice(0, 1000) || "imagen" });
  }
  if (fileLinks.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: fileLinks.join("\n") } });

  const fallback = [lead, ...fileLinks, ...images.map((i) => `🖼️ ${i.name}`)].filter(Boolean).join("\n");
  return { text: fallback || "(imagen)", blocks };
}
