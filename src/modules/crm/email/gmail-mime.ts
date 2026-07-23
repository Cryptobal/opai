import { randomUUID } from "node:crypto";

export type GmailOutboundAttachment = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

/** Imagen inline referenciada desde el HTML vía `src="cid:<contentId>"` (P06). */
export type GmailInlineImage = {
  contentId: string;
  mimeType: string;
  content: Buffer;
  fileName?: string;
};

export type GmailRawMessageInput = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: GmailOutboundAttachment[];
  inlineImages?: GmailInlineImage[];
};

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 para headers no ASCII. */
export function encodeGmailHeaderWord(value: string): string {
  const safe = safeHeader(value);
  return /[^\x20-\x7e]/.test(safe)
    ? `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`
    : safe;
}

function wrapBase64(value: Buffer | string): string {
  const encoded = Buffer.isBuffer(value)
    ? value.toString("base64")
    : Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textPart(contentType: "text/plain" | "text/html", content: string): string {
  return [
    `Content-Type: ${contentType}; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(content),
  ].join("\r\n");
}

function bodyEntity(input: GmailRawMessageInput): {
  headers: string[];
  body: string;
} {
  if (input.html) {
    const boundary = `opai_alt_${randomUUID()}`;
    const plain = input.text?.trim() || htmlToPlainText(input.html);
    return {
      headers: [`Content-Type: multipart/alternative; boundary="${boundary}"`],
      body: [
        `--${boundary}`,
        textPart("text/plain", plain),
        `--${boundary}`,
        textPart("text/html", input.html),
        `--${boundary}--`,
      ].join("\r\n"),
    };
  }
  return {
    headers: [
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ],
    body: wrapBase64(input.text ?? ""),
  };
}

/** Content-ID seguro para header: sin CRLF ni <> (se agregan al emitir). */
function safeContentId(contentId: string): string {
  return safeHeader(contentId).replace(/[<>"\s]/g, "");
}

/**
 * Envuelve la entidad del cuerpo en multipart/related con las imágenes inline
 * (Content-ID + Content-Disposition: inline), para HTML con `src="cid:..."`.
 */
function relatedEntity(
  entity: { headers: string[]; body: string },
  inlineImages: GmailInlineImage[],
): { headers: string[]; body: string } {
  const boundary = `opai_rel_${randomUUID()}`;
  const parts = [`--${boundary}`, ...entity.headers, "", entity.body];
  for (const image of inlineImages) {
    const cid = safeContentId(image.contentId);
    const mimeType = safeHeader(image.mimeType || "application/octet-stream");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      `Content-ID: <${cid}>`,
      `Content-Disposition: inline${
        image.fileName
          ? `; filename="${safeHeader(image.fileName).replace(/[\\/\x00-\x1f\x7f"]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 200)}"`
          : ""
      }`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(image.content),
    );
  }
  parts.push(`--${boundary}--`);
  return {
    headers: [`Content-Type: multipart/related; boundary="${boundary}"`],
    body: parts.join("\r\n"),
  };
}

function attachmentDisposition(fileName: string): string {
  const clean = safeHeader(fileName)
    .replace(/[\\/\x00-\x1f\x7f"]/g, "_")
    .slice(0, 200) || "archivo";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(clean.toWellFormed()).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Construye un mensaje RFC 5322/MIME y lo devuelve en base64url, formato
 * requerido por `gmail.users.messages.send`.
 */
export function buildGmailRawMessage(input: GmailRawMessageInput): string {
  let entity = bodyEntity(input);
  // Imágenes inline (P06): alternative va DENTRO de related, y related dentro
  // de mixed si además hay adjuntos — jerarquía estándar de clientes de correo.
  if (input.inlineImages?.length) {
    entity = relatedEntity(entity, input.inlineImages);
  }
  const attachments = input.attachments ?? [];
  let entityHeaders = entity.headers;
  let body = entity.body;

  if (attachments.length > 0) {
    const boundary = `opai_mixed_${randomUUID()}`;
    entityHeaders = [`Content-Type: multipart/mixed; boundary="${boundary}"`];
    const parts = [
      `--${boundary}`,
      ...entity.headers,
      "",
      entity.body,
    ];
    for (const attachment of attachments) {
      const mimeType = safeHeader(
        attachment.mimeType || "application/octet-stream",
      );
      parts.push(
        `--${boundary}`,
        `Content-Type: ${mimeType}`,
        `Content-Disposition: ${attachmentDisposition(attachment.fileName)}`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(attachment.content),
      );
    }
    parts.push(`--${boundary}--`);
    body = parts.join("\r\n");
  }

  const headers = [
    `From: ${safeHeader(input.from)}`,
    `To: ${input.to.map(safeHeader).join(", ")}`,
    input.cc?.length
      ? `Cc: ${input.cc.map(safeHeader).join(", ")}`
      : null,
    input.bcc?.length
      ? `Bcc: ${input.bcc.map(safeHeader).join(", ")}`
      : null,
    `Subject: ${encodeGmailHeaderWord(input.subject)}`,
    input.inReplyTo
      ? `In-Reply-To: ${safeHeader(input.inReplyTo)}`
      : null,
    input.references
      ? `References: ${safeHeader(input.references)}`
      : null,
    "MIME-Version: 1.0",
    ...entityHeaders,
  ]
    .filter((header): header is string => Boolean(header))
    .join("\r\n");

  return Buffer.from(`${headers}\r\n\r\n${body}`, "utf8").toString(
    "base64url",
  );
}
