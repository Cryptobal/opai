/**
 * Reescribe `src="cid:…"` del HTML del correo a URLs del endpoint de adjuntos
 * OPAI. Outlook/Gmail embeben firmas (image001.jpg) como multipart/related con
 * Content-ID; sin esto el lector muestra el ícono de imagen rota.
 */

export type CidAttachmentRef = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType?: string;
  contentId?: string | null;
  size?: number;
};

function normalizeCid(raw: string): string {
  return raw.replace(/^<|>$/g, "").trim().toLowerCase();
}

function attachmentUrl(
  threadId: string,
  att: CidAttachmentRef,
): string {
  const qs = new URLSearchParams();
  if (att.filename) qs.set("fn", att.filename);
  if (att.size && att.size > 0) qs.set("sz", String(att.size));
  const q = qs.toString();
  return `/api/crm/correos/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(att.messageId)}/${encodeURIComponent(att.attachmentId)}${q ? `?${q}` : ""}`;
}

/** Resuelve un cid a un adjunto del mismo mensaje (o del hilo). */
export function resolveCidAttachment(
  cidRaw: string,
  attachments: CidAttachmentRef[],
  messageId?: string,
): CidAttachmentRef | null {
  const cid = normalizeCid(cidRaw);
  if (!cid) return null;
  const scoped = messageId
    ? attachments.filter((a) => a.messageId === messageId)
    : attachments;
  const pool = scoped.length > 0 ? scoped : attachments;

  const byContentId = pool.find(
    (a) => a.contentId && normalizeCid(a.contentId) === cid,
  );
  if (byContentId) return byContentId;

  const byFilename = pool.find(
    (a) => a.filename && a.filename.toLowerCase() === cid,
  );
  if (byFilename) return byFilename;

  // cid a veces es solo el local-part (`image001.jpg@01D…`).
  const local = cid.split("@")[0] || "";
  if (local) {
    const byLocal = pool.find(
      (a) => a.filename && a.filename.toLowerCase() === local,
    );
    if (byLocal) return byLocal;
    const byContentLocal = pool.find(
      (a) => a.contentId && normalizeCid(a.contentId).split("@")[0] === local,
    );
    if (byContentLocal) return byContentLocal;
  }

  // Un solo adjunto imagen en el mensaje: firmas Outlook típicas.
  const images = pool.filter((a) => (a.mimeType || "").startsWith("image/"));
  if (images.length === 1) return images[0]!;

  return null;
}

/**
 * Sustituye cada `src="cid:…"` por la URL autenticada del adjunto.
 * Si no hay match, deja el cid (el navegador seguirá mostrando broken icon).
 */
export function rewriteCidImages(
  html: string,
  threadId: string,
  attachments: CidAttachmentRef[],
  messageId?: string,
): string {
  if (!html || !threadId || attachments.length === 0) return html;
  return html.replace(
    /\bsrc\s*=\s*(["'])cid:([^"']+)\1/gi,
    (full, quote: string, cidRaw: string) => {
      const att = resolveCidAttachment(cidRaw, attachments, messageId);
      if (!att) return full;
      return `src=${quote}${attachmentUrl(threadId, att)}${quote}`;
    },
  );
}
