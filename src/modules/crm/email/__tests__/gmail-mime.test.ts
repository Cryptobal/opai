import { describe, expect, it } from "vitest";
import {
  buildGmailRawMessage,
  encodeGmailHeaderWord,
} from "../gmail-mime";

function decode(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

describe("buildGmailRawMessage", () => {
  it("construye texto plano con headers MIME válidos", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Hola",
        text: "Mensaje simple",
      }),
    );
    expect(message).toContain("Content-Type: text/plain; charset=\"UTF-8\"");
    expect(message).toContain("Content-Transfer-Encoding: base64");
    expect(message).toContain(
      Buffer.from("Mensaje simple").toString("base64"),
    );
  });

  it("genera mixed + alternative y filename UTF-8", () => {
    const content = Buffer.from("pdf-content");
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Cotización número 1",
        html: "<p>Adjunto propuesta</p>",
        attachments: [
          {
            fileName: "cotización final.pdf",
            mimeType: "application/pdf",
            content,
          },
        ],
      }),
    );
    expect(message).toContain("Content-Type: multipart/mixed;");
    expect(message).toContain("Content-Type: multipart/alternative;");
    expect(message).toContain("filename*=UTF-8''cotizaci%C3%B3n%20final.pdf");
    expect(message).toContain(content.toString("base64"));
    expect(message).toContain("Subject: =?UTF-8?B?");
  });

  it("incluye In-Reply-To y References en un reply (threading B2)", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Re: Cotización",
        text: "Respuesta",
        inReplyTo: "<CABC123@mail.gmail.com>",
        references: "<CAROOT@mail.gmail.com> <CABC123@mail.gmail.com>",
      }),
    );
    expect(message).toContain("In-Reply-To: <CABC123@mail.gmail.com>");
    expect(message).toContain(
      "References: <CAROOT@mail.gmail.com> <CABC123@mail.gmail.com>",
    );
  });

  it("sin contexto de reply no emite headers de threading", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Nuevo",
        text: "Mensaje nuevo",
      }),
    );
    expect(message).not.toContain("In-Reply-To:");
    expect(message).not.toContain("References:");
  });

  it("neutraliza inyección de headers vía Message-ID del padre", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Re: x",
        text: "r",
        inReplyTo: "<id@x>\r\nBcc: attacker@example.com",
      }),
    );
    expect(message).not.toContain("\r\nBcc: attacker@example.com");
  });

  it("neutraliza saltos de línea en headers", () => {
    expect(encodeGmailHeaderWord("Asunto\r\nBcc: attacker@example.com")).toBe(
      "Asunto Bcc: attacker@example.com",
    );
  });

  it("imagen inline genera multipart/related con Content-ID (P06)", () => {
    const png = Buffer.from("png-bytes");
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Con imagen",
        html: '<p>Mirá: <img src="cid:img-1@opai"></p>',
        inlineImages: [
          { contentId: "img-1@opai", mimeType: "image/png", content: png },
        ],
      }),
    );
    expect(message).toContain("Content-Type: multipart/related;");
    expect(message).toContain("Content-Type: multipart/alternative;");
    expect(message).toContain("Content-ID: <img-1@opai>");
    expect(message).toContain("Content-Disposition: inline");
    expect(message).toContain(png.toString("base64"));
  });

  it("inline + adjunto: related queda DENTRO de mixed", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Todo junto",
        html: '<p><img src="cid:logo@opai"></p>',
        inlineImages: [
          { contentId: "logo@opai", mimeType: "image/png", content: Buffer.from("img") },
        ],
        attachments: [
          { fileName: "doc.pdf", mimeType: "application/pdf", content: Buffer.from("pdf") },
        ],
      }),
    );
    const mixedIndex = message.indexOf("multipart/mixed");
    const relatedIndex = message.indexOf("multipart/related");
    const alternativeIndex = message.indexOf("multipart/alternative");
    expect(mixedIndex).toBeGreaterThan(-1);
    expect(relatedIndex).toBeGreaterThan(mixedIndex);
    expect(alternativeIndex).toBeGreaterThan(relatedIndex);
  });

  it("neutraliza inyección de headers vía Content-ID", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "x",
        html: "<p>x</p>",
        inlineImages: [
          {
            contentId: "a@b>\r\nBcc: attacker@example.com",
            mimeType: "image/png",
            content: Buffer.from("i"),
          },
        ],
      }),
    );
    expect(message).not.toContain("\r\nBcc: attacker@example.com");
  });

  it("codifica caracteres reservados del filename* MIME", () => {
    const message = decode(
      buildGmailRawMessage({
        from: "yo@example.com",
        to: ["cliente@example.com"],
        subject: "Adjunto",
        text: "Archivo",
        attachments: [
          {
            fileName: "O'Brien (final)*.pdf",
            mimeType: "application/pdf",
            content: Buffer.from("pdf"),
          },
        ],
      }),
    );

    expect(message).toContain(
      "filename*=UTF-8''O%27Brien%20%28final%29%2A.pdf",
    );
  });
});
