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

  it("neutraliza saltos de línea en headers", () => {
    expect(encodeGmailHeaderWord("Asunto\r\nBcc: attacker@example.com")).toBe(
      "Asunto Bcc: attacker@example.com",
    );
  });
});
