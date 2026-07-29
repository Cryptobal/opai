export type GmailMessagePart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: GmailMessagePart[] | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
};

export type GmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Content-ID sin <>, para resolver `src="cid:…"` en el HTML del correo. */
  contentId?: string | null;
};

/** Extrae Content-ID de headers MIME (`<foo@bar>` → `foo@bar`). */
export function contentIdFromPartHeaders(
  headers?: Array<{ name?: string | null; value?: string | null }> | null,
): string | null {
  if (!headers?.length) return null;
  const raw = headers.find((h) => (h.name || "").toLowerCase() === "content-id")?.value;
  if (!raw) return null;
  return raw.replace(/^<|>$/g, "").trim() || null;
}

function isCalendarPart(part: GmailMessagePart): boolean {
  const mt = (part.mimeType || "").toLowerCase();
  const fn = (part.filename || "").toLowerCase();
  return mt.includes("text/calendar") || mt.includes("application/ics") || fn.endsWith(".ics") || fn.endsWith(".ical");
}

/** Recorre el árbol de partes y devuelve los adjuntos (con attachmentId).
 *  Incluye partes `text/calendar` aunque vengan sin filename (invites Outlook/Google). */
export function extractGmailAttachments(payload?: GmailMessagePart): GmailAttachmentMeta[] {
  const out: GmailAttachmentMeta[] = [];
  if (!payload) return out;
  const stack: GmailMessagePart[] = [payload];
  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;
    if (part.body?.attachmentId && (part.filename || isCalendarPart(part))) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename || (isCalendarPart(part) ? "invite.ics" : "attachment"),
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size ?? 0,
        contentId: contentIdFromPartHeaders(part.headers),
      });
    }
    if (part.parts?.length) stack.push(...part.parts);
  }
  return out;
}

export type InlineCalendarPart = {
  mimeType: string;
  filename: string;
  /** ICS en texto (ya decodificado de body.data). */
  icsText: string;
  attachmentId?: string | null;
};

/**
 * Busca partes de calendario en el payload: adjuntos (attachmentId) o inline
 * (body.data). Preferir attachmentId cuando exista.
 */
export function extractCalendarParts(payload?: GmailMessagePart): InlineCalendarPart[] {
  const out: InlineCalendarPart[] = [];
  if (!payload) return out;
  const stack: GmailMessagePart[] = [payload];
  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) continue;
    if (isCalendarPart(part)) {
      if (part.body?.attachmentId) {
        out.push({
          mimeType: part.mimeType || "text/calendar",
          filename: part.filename || "invite.ics",
          icsText: "",
          attachmentId: part.body.attachmentId,
        });
      } else if (part.body?.data) {
        const icsText = decodeBase64Url(part.body.data);
        if (icsText.includes("BEGIN:")) {
          out.push({
            mimeType: part.mimeType || "text/calendar",
            filename: part.filename || "invite.ics",
            icsText,
            attachmentId: null,
          });
        }
      }
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
