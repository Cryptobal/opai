import { describe, expect, it } from "vitest";
import { classifyAttachment } from "../attachment-preview-kind";

describe("classifyAttachment", () => {
  it("clasifica DOCX por MIME OOXML aunque contenga 'xml'", () => {
    expect(
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "1770823147942_RFI Servicio de Vigilancia y Seguridad.docx"
      )
    ).toBe("docx");
  });

  it("clasifica DOCX por extensión con MIME genérico", () => {
    expect(
      classifyAttachment("application/octet-stream", "propuesta.docx")
    ).toBe("docx");
  });

  it("rechaza .doc binario legacy (mammoth no lo lee)", () => {
    expect(classifyAttachment("application/msword", "viejo.doc")).toBe("other");
  });

  it("sigue bloqueando HTML/XML/SVG reales (XSS)", () => {
    expect(classifyAttachment("text/html", "a.html")).toBe("other");
    expect(classifyAttachment("application/xml", "a.xml")).toBe("other");
    expect(classifyAttachment("image/svg+xml", "a.svg")).toBe("other");
  });

  it("clasifica pdf, imagen, texto y xlsx", () => {
    expect(classifyAttachment("application/pdf", "a.pdf")).toBe("pdf");
    expect(classifyAttachment("image/png", "a.png")).toBe("image");
    expect(classifyAttachment("text/plain", "notas.txt")).toBe("text");
    expect(
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "planilla.xlsx"
      )
    ).toBe("xlsx");
  });
});
