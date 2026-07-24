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

/**
 * true si el payload trae al menos un trozo de cuerpo usable en línea
 * (`body.data`) o referenciado (`body.attachmentId` en text/html|plain).
 * Sirve para detectar prefetch incompletos del batch y forzar un get full.
 */
export function payloadHasMessageBody(payload?: GmailMessagePart | null): boolean {
  if (!payload) return false;
  const stack: GmailMessagePart[] = [payload];
  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;
    const mime = (part.mimeType || "").toLowerCase();
    const isText = mime.includes("text/html") || mime.includes("text/plain");
    if (isText && (part.body?.data || part.body?.attachmentId)) return true;
    // Algunos mensajes simples ponen el cuerpo en la raíz sin mime text/*.
    if (!part.parts?.length && part.body?.data) return true;
    if (part.parts?.length) stack.push(...part.parts);
  }
  return false;
}

export type FetchGmailAttachmentFn = (attachmentId: string) => Promise<string | null>;

async function decodePartBody(
  part: GmailMessagePart,
  fetchAttachment?: FetchGmailAttachmentFn,
): Promise<string> {
  const inline = decodeBase64Url(part.body?.data);
  if (inline) return inline;
  // Gmail omite `body.data` y deja `attachmentId` cuando el trozo es grande
  // (o a veces en multipart anidados). Sin este fetch el HTML queda vacío
  // aunque el correo exista en Gmail.
  if (part.body?.attachmentId && fetchAttachment) {
    const data = await fetchAttachment(part.body.attachmentId);
    return decodeBase64Url(data);
  }
  return "";
}

/**
 * Extrae text/html y text/plain del árbol MIME. Versión sync: solo lee
 * `body.data` inline (compat con callers que no tienen cliente Gmail).
 */
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

/**
 * Igual que `extractGmailMessageBodies`, pero resuelve partes cuyo cuerpo
 * solo viene como `attachmentId` (fetch a messages.attachments.get).
 */
export async function extractGmailMessageBodiesAsync(
  payload: GmailMessagePart | undefined,
  fetchAttachment?: FetchGmailAttachmentFn,
): Promise<{ htmlBody: string | null; textBody: string | null }> {
  if (!payload) return { htmlBody: null, textBody: null };

  let htmlBody: string | null = null;
  let textBody: string | null = null;
  const stack: GmailMessagePart[] = [payload];

  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;

    const mimeType = (part.mimeType || "").toLowerCase();
    const needsFetch =
      !part.body?.data && Boolean(part.body?.attachmentId) && Boolean(fetchAttachment);
    const isText = mimeType.includes("text/html") || mimeType.includes("text/plain");

    // Evita fetches caros en adjuntos binarios (pdf/imagen): solo texto.
    if (isText || (!part.parts?.length && part.body?.data)) {
      const decoded =
        needsFetch && isText
          ? await decodePartBody(part, fetchAttachment)
          : decodeBase64Url(part.body?.data);

      if (decoded) {
        if (!htmlBody && mimeType.includes("text/html")) htmlBody = decoded;
        if (!textBody && mimeType.includes("text/plain")) textBody = decoded;
        // Mensaje simple sin multipart: el root suele ser text/html o text/plain.
        if (!htmlBody && !textBody && !part.parts?.length && !mimeType.startsWith("multipart/")) {
          if (mimeType.includes("html")) htmlBody = decoded;
          else textBody = decoded;
        }
      }
    }

    if (part.parts?.length) stack.push(...part.parts);
  }

  return { htmlBody, textBody };
}
