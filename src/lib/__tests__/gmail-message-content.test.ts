import { describe, expect, it, vi } from "vitest";
import {
  contentIdFromPartHeaders,
  decodeBase64Url,
  extractGmailAttachments,
  extractGmailMessageBodies,
  extractGmailMessageBodiesAsync,
  payloadHasMessageBody,
  type GmailMessagePart,
} from "../gmail-message-content";

function b64url(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("extractGmailMessageBodies", () => {
  it("lee text/html y text/plain inline", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("hola texto") } },
        { mimeType: "text/html", body: { data: b64url("<p>hola html</p>") } },
      ],
    };
    expect(extractGmailMessageBodies(payload)).toEqual({
      htmlBody: "<p>hola html</p>",
      textBody: "hola texto",
    });
  });

  it("sin body.data ni attachmentId → vacío", () => {
    expect(
      extractGmailMessageBodies({
        mimeType: "text/html",
        body: { size: 1200 },
      }),
    ).toEqual({ htmlBody: null, textBody: null });
  });
});

describe("extractGmailMessageBodiesAsync", () => {
  it("resuelve cuerpo que solo viene como attachmentId", async () => {
    const fetchAttachment = vi.fn().mockResolvedValue(b64url("<b>Contacto General</b>"));
    const payload: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/html",
          body: { attachmentId: "att-1", size: 2000 },
        },
      ],
    };
    const bodies = await extractGmailMessageBodiesAsync(payload, fetchAttachment);
    expect(fetchAttachment).toHaveBeenCalledWith("att-1");
    expect(bodies.htmlBody).toBe("<b>Contacto General</b>");
  });

  it("no fetcha adjuntos binarios (solo text/*)", async () => {
    const fetchAttachment = vi.fn().mockResolvedValue(b64url("pdf"));
    const payload: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/pdf",
          filename: "a.pdf",
          body: { attachmentId: "pdf-1", size: 9000 },
        },
      ],
    };
    const bodies = await extractGmailMessageBodiesAsync(payload, fetchAttachment);
    expect(fetchAttachment).not.toHaveBeenCalled();
    expect(bodies).toEqual({ htmlBody: null, textBody: null });
  });
});

describe("payloadHasMessageBody", () => {
  it("detecta body inline y attachmentId de texto", () => {
    expect(payloadHasMessageBody(undefined)).toBe(false);
    expect(
      payloadHasMessageBody({
        mimeType: "text/html",
        body: { data: b64url("<p>x</p>") },
      }),
    ).toBe(true);
    expect(
      payloadHasMessageBody({
        mimeType: "text/html",
        body: { attachmentId: "a1" },
      }),
    ).toBe(true);
  });
});

describe("decodeBase64Url", () => {
  it("decodifica y tolera padding faltante", () => {
    expect(decodeBase64Url(b64url("opai"))).toBe("opai");
    expect(decodeBase64Url(null)).toBe("");
  });
});

describe("extractGmailAttachments + Content-ID", () => {
  it("extrae contentId de headers de la parte", () => {
    expect(contentIdFromPartHeaders([{ name: "Content-ID", value: "<image001.jpg@01D>" }])).toBe(
      "image001.jpg@01D",
    );
    const atts = extractGmailAttachments({
      mimeType: "multipart/related",
      parts: [
        {
          mimeType: "image/jpeg",
          filename: "image001.jpg",
          headers: [{ name: "Content-ID", value: "<image001.jpg@01D>" }],
          body: { attachmentId: "att-1", size: 100 },
        },
      ],
    });
    expect(atts).toEqual([
      {
        attachmentId: "att-1",
        filename: "image001.jpg",
        mimeType: "image/jpeg",
        size: 100,
        contentId: "image001.jpg@01D",
      },
    ]);
  });

  it("incluye imágenes inline sin filename (capturas CID)", () => {
    const atts = extractGmailAttachments({
      mimeType: "multipart/related",
      parts: [
        {
          mimeType: "image/png",
          headers: [{ name: "Content-ID", value: "<ii_abc@gmail>" }],
          body: { attachmentId: "att-img", size: 50000 },
        },
      ],
    });
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({
      attachmentId: "att-img",
      filename: "inline.png",
      mimeType: "image/png",
      contentId: "ii_abc@gmail",
    });
  });
});
