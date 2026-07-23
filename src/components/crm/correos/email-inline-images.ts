"use client";

/**
 * Imágenes inline del composer (P06): el editor las mantiene como data URL;
 * al enviar se suben al staging R2 y el HTML pasa a referenciarlas por
 * `cid:` — el server las adjunta como multipart/related con Content-ID.
 */

export type StagedInlineImagePayload = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  contentId: string;
};

const DATA_IMG_RE = /<img\b[^>]*\bsrc="(data:image\/[a-z+.-]+;base64,[^"]+)"[^>]*>/gi;

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } | null {
  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: match[1] }), mimeType: match[1] };
  } catch {
    return null;
  }
}

async function stageBlob(params: {
  blob: Blob;
  mimeType: string;
  fileName: string;
}): Promise<{ storageKey: string } | null> {
  const presign = await fetch("/api/crm/gmail/attachments/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: params.fileName,
      mimeType: params.mimeType,
      size: params.blob.size,
    }),
  });
  const payload = (await presign.json().catch(() => ({}))) as {
    data?: { uploadUrl: string; storageKey: string };
  };
  if (!presign.ok || !payload.data) return null;
  const put = await fetch(payload.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.mimeType },
    body: params.blob,
  });
  if (!put.ok) return null;
  return { storageKey: payload.data.storageKey };
}

/**
 * Reemplaza cada `<img src="data:image/...">` del HTML por `cid:` subiendo la
 * imagen al staging. Lanza si alguna subida falla (mejor abortar el envío que
 * mandar el correo sin la imagen).
 */
export async function extractInlineImages(html: string): Promise<{
  html: string;
  inlineImages: StagedInlineImagePayload[];
}> {
  const matches = [...html.matchAll(DATA_IMG_RE)];
  if (matches.length === 0) return { html, inlineImages: [] };

  const inlineImages: StagedInlineImagePayload[] = [];
  const replacementBySrc = new Map<string, string>();
  let index = 0;
  for (const match of matches) {
    const dataUrl = match[1];
    if (replacementBySrc.has(dataUrl)) continue;
    const decoded = dataUrlToBlob(dataUrl);
    if (!decoded) throw new Error("Imagen inline inválida");
    index += 1;
    const ext = decoded.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
    const fileName = `inline-${index}.${ext}`;
    const staged = await stageBlob({
      blob: decoded.blob,
      mimeType: decoded.mimeType,
      fileName,
    });
    if (!staged) throw new Error("No se pudo subir una imagen inline");
    const contentId = `${crypto.randomUUID()}@opai`;
    inlineImages.push({
      storageKey: staged.storageKey,
      fileName,
      mimeType: decoded.mimeType,
      size: decoded.blob.size,
      contentId,
    });
    replacementBySrc.set(dataUrl, `cid:${contentId}`);
  }

  let result = html;
  for (const [src, cid] of replacementBySrc) {
    result = result.split(`src="${src}"`).join(`src="${cid}"`);
  }
  return { html: result, inlineImages };
}

/** Borrador IA / texto plano → doc Tiptap (párrafos + hardBreaks). */
export function plainTextToTiptapDoc(text: string): object {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => {
      const lines = paragraph.split("\n");
      const content: object[] = [];
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return content.length > 0
        ? { type: "paragraph", content }
        : { type: "paragraph" };
    }),
  };
}
