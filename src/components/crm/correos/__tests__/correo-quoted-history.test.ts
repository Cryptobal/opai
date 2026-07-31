import { describe, expect, it } from "vitest";
import {
  appendQuotedHtmlToSend,
  buildQuotedMessageInnerHtml,
  htmlContainsGmailQuote,
  quoteSendHeader,
  splitDraftBodyAndQuote,
} from "../correo-quoted-history";

describe("splitDraftBodyAndQuote", () => {
  it("separa cuerpo y gmail_quote", () => {
    const html =
      "<p>Mi respuesta</p><div class=\"gmail_quote\">--------- Mensaje original ---------<br><p>Hola</p></div>";
    const { bodyHtml, quotedHtml } = splitDraftBodyAndQuote(html);
    expect(bodyHtml).toBe("<p>Mi respuesta</p>");
    expect(quotedHtml).toContain("gmail_quote");
    expect(quotedHtml).toContain("Hola");
  });

  it("sin marcador deja todo como cuerpo", () => {
    const { bodyHtml, quotedHtml } = splitDraftBodyAndQuote("<p>solo</p>");
    expect(bodyHtml).toBe("<p>solo</p>");
    expect(quotedHtml).toBeNull();
  });
});

describe("htmlContainsGmailQuote", () => {
  it("detecta class gmail_quote", () => {
    expect(htmlContainsGmailQuote('<div class="gmail_quote">x</div>')).toBe(true);
    expect(htmlContainsGmailQuote("<p>no</p>")).toBe(false);
  });
});

describe("buildQuotedMessageInnerHtml", () => {
  it("arma meta + cuerpo HTML", () => {
    const out = buildQuotedMessageInnerHtml({
      fromEmail: "a@b.cl",
      sentAt: "2026-01-15T15:00:00.000Z",
      subject: "Hola <test>",
      toEmails: ["c@d.cl"],
      htmlBody: "<p>Cuerpo</p>",
      textBody: null,
    });
    expect(out).toContain("De: a@b.cl");
    expect(out).toContain("Asunto: Hola &lt;test&gt;");
    expect(out).toContain("<p>Cuerpo</p>");
  });

  it("cae a texto escapado si no hay HTML", () => {
    const out = buildQuotedMessageInnerHtml({
      fromEmail: "a@b.cl",
      sentAt: null,
      subject: "S",
      toEmails: [],
      htmlBody: null,
      textBody: "línea1\nlínea2",
    });
    expect(out).toContain("línea1<br>línea2");
  });
});

describe("appendQuotedHtmlToSend", () => {
  it("anexa con encabezado de forward", () => {
    const out = appendQuotedHtmlToSend("<p>hola</p>", "<p>orig</p>", "forward");
    expect(out).toContain(quoteSendHeader("forward"));
    expect(out).toContain('class="gmail_quote"');
    expect(out).toContain("<p>orig</p>");
  });

  it("anexa con encabezado de reply", () => {
    const out = appendQuotedHtmlToSend("<p>hola</p>", "<p>orig</p>", "reply");
    expect(out).toContain(quoteSendHeader("reply"));
  });

  it("no duplica si el cuerpo ya tiene gmail_quote", () => {
    const body = '<p>x</p><div class="gmail_quote">ya</div>';
    expect(appendQuotedHtmlToSend(body, "<p>otro</p>", "reply")).toBe(body);
  });

  it("no re-envuelve si quotedHtml ya trae gmail_quote (borrador viejo)", () => {
    const quoted = '<div class="gmail_quote">--------- Mensaje original ---------<br>q</div>';
    const out = appendQuotedHtmlToSend("<p>r</p>", quoted, "reply");
    expect(out).toBe(`<p>r</p><br>${quoted}`);
    expect(out.match(/gmail_quote/g)?.length).toBe(1);
  });
});
