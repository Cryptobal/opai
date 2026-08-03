import { describe, expect, it } from "vitest";
import {
  appendQuotedHtmlToSend,
  buildQuotedMessageInnerHtml,
  htmlContainsGmailQuote,
  quoteSendHeader,
  splitDraftBodyAndQuote,
  splitMessageQuote,
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

describe("splitMessageQuote", () => {
  it("gmail: corta en el div gmail_quote", () => {
    const html =
      '<p>Respuesta</p><div class="gmail_quote"><p>El 3 de enero…</p></div>';
    const { bodyHtml, quotedHtml } = splitMessageQuote(html);
    expect(bodyHtml).toBe("<p>Respuesta</p>");
    expect(quotedHtml).toContain("gmail_quote");
  });

  it("apple mail: corta en blockquote type=cite", () => {
    const html = '<div>Nuevo</div><blockquote type="cite"><p>viejo</p></blockquote>';
    const { bodyHtml, quotedHtml } = splitMessageQuote(html);
    expect(bodyHtml).toBe("<div>Nuevo</div>");
    expect(quotedHtml).toContain("viejo");
  });

  it("outlook: corta en divRplyFwdMsg / appendonsend", () => {
    const outlook =
      '<div>Texto nuevo</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg">De: x</div>';
    expect(splitMessageQuote(outlook).bodyHtml).toBe("<div>Texto nuevo</div>");
    const fwd = '<div>Hola</div><div id="divRplyFwdMsg">De: alguien</div>';
    expect(splitMessageQuote(fwd).quotedHtml).toContain("divRplyFwdMsg");
  });

  it("outlook Word ES: corta en border-top + De:/Enviado el (sin divRplyFwdMsg)", () => {
    const html = [
      '<p class="MsoNormal">Estimado Carlos, buenas tardes.</p>',
      '<p class="MsoNormal">Firma</p>',
      '<div>',
      '<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm">',
      '<p class="MsoNormal"><b><span lang="ES">De:</span></b><span lang="ES"> Juan Carlos',
      '<br><b>Enviado el:</b> viernes, 24 de julio de 2026 11:57<br>',
      "<b>Para:</b> Carlos<br>",
      "<b>Asunto:</b> RE: Cotización</span></p>",
      "</div></div>",
      '<p class="MsoNormal">Estimado Carlos, buen día.</p>',
    ].join("");
    const { bodyHtml, quotedHtml } = splitMessageQuote(html);
    expect(bodyHtml).toContain("buenas tardes");
    expect(bodyHtml).not.toContain("Enviado el");
    expect(quotedHtml).toContain("border-top:solid");
    expect(quotedHtml).toContain("Enviado el");
  });

  it("separador textual Mensaje original / Original Message", () => {
    const es =
      "<p>Nuevo</p><div>-----Mensaje original-----</div><div>viejo</div>";
    expect(splitMessageQuote(es).quotedHtml).toContain("Mensaje original");
    const en =
      "<p>New</p><div>-----Original Message-----</div><div>old</div>";
    expect(splitMessageQuote(en).bodyHtml).toBe("<p>New</p>");
  });

  it("yahoo y thunderbird tienen su marcador", () => {
    expect(
      splitMessageQuote('<p>a</p><div class="yahoo_quoted">viejo</div>').quotedHtml,
    ).toContain("yahoo_quoted");
    expect(
      splitMessageQuote('<p>a</p><div class="moz-cite-prefix">El … escribió:</div>')
        .quotedHtml,
    ).toContain("moz-cite-prefix");
  });

  it("cabecera textual al inicio de bloque corta; en medio de un párrafo no", () => {
    const header =
      "<p>Listo, lo vemos.</p><div>El 3 de enero de 2026, Juan Pérez escribió:</div><div>anterior</div>";
    const cut = splitMessageQuote(header);
    expect(cut.bodyHtml).toBe("<p>Listo, lo vemos.</p>");
    expect(cut.quotedHtml).toContain("anterior");

    const inline = "<p>Ayer El gerente de la sucursal escribió: nada relevante.</p>";
    expect(splitMessageQuote(inline).quotedHtml).toBeNull();
  });

  it("no corta si el cuerpo quedaría vacío (correo que es solo forward)", () => {
    const onlyQuote = '<div class="gmail_quote"><p>todo el historial</p></div>';
    const out = splitMessageQuote(onlyQuote);
    expect(out.bodyHtml).toBe(onlyQuote);
    expect(out.quotedHtml).toBeNull();

    const blankBody = '<div>&nbsp;</div><div class="gmail_quote">h</div>';
    expect(splitMessageQuote(blankBody).quotedHtml).toBeNull();
  });

  it("un cuerpo de solo imagen cuenta como contenido y sí recorta", () => {
    const html = '<div><img src="https://x/y.png"></div><div class="gmail_quote">h</div>';
    expect(splitMessageQuote(html).quotedHtml).toContain("gmail_quote");
  });

  it("sin marcador devuelve todo como cuerpo", () => {
    expect(splitMessageQuote("<p>solo</p>")).toEqual({
      bodyHtml: "<p>solo</p>",
      quotedHtml: null,
    });
    expect(splitMessageQuote(null)).toEqual({ bodyHtml: null, quotedHtml: null });
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
