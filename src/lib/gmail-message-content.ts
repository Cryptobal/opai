export type GmailMessagePart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: GmailMessagePart[] | null;
};

export type GmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

/** Recorre el árbol de partes y devuelve los adjuntos (con attachmentId). */
export function extractGmailAttachments(payload?: GmailMessagePart): GmailAttachmentMeta[] {
  const out: GmailAttachmentMeta[] = [];
  if (!payload) return out;
  const stack: GmailMessagePart[] = [payload];
  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;
    if (part.filename && part.body?.attachmentId) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }
    if (part.parts?.length) stack.push(...part.parts);
  }
  return out;
}

export function decodeBase64Url(value?: string | null): string {
  if (!value) return "";

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    return Buffer.from(`${base64}${padding}`, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function extractGmailMessageBodies(payload?: GmailMessagePart): {
  htmlBody: string | null;
  textBody: string | null;
} {
  if (!payload) return { htmlBody: null, textBody: null };

  let htmlBody: string | null = null;
  let textBody: string | null = null;
  const stack: GmailMessagePart[] = [payload];

  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;

    const mimeType = (part.mimeType || "").toLowerCase();
    const decoded = decodeBase64Url(part.body?.data);

    if (decoded) {
      if (!htmlBody && mimeType.includes("text/html")) {
        htmlBody = decoded;
      }
      if (!textBody && mimeType.includes("text/plain")) {
        textBody = decoded;
      }
    }

    if (part.parts?.length) {
      stack.push(...part.parts);
    }
  }

  return { htmlBody, textBody };
}
