import { describe, expect, it } from "vitest";
import { parseSignatureData } from "../signature-data";
import { renderSignatureHtml } from "../signature-render";

const R2 = "https://cdn.example.com";

function sample(overrides: Record<string, unknown> = {}) {
  return parseSignatureData(
    {
      fullName: "Carlos Irigoyen",
      role: "Gerente General",
      company: "Gard",
      phone: "+56 9 8765 4321",
      whatsapp: "+56 9 8765 4321",
      email: "carlos@gard.cl",
      website: "gard.cl",
      address: "Av. Apoquindo 4501",
      logoUrl: `${R2}/signatures/logo.png`,
      logoWidthPx: 120,
      layout: "logo-left",
      accentColor: "#0f8f74",
      ...overrides,
    },
    R2,
  );
}

describe("signature-render / parseSignatureData", () => {
  it("1. tel: normalizado a +56987654321 desde +56 9 8765 4321", () => {
    const html = renderSignatureHtml(sample());
    expect(html).toContain('href="tel:+56987654321"');
  });

  it("2. wa.me/56987654321 sin +", () => {
    const html = renderSignatureHtml(sample());
    expect(html).toContain('href="https://wa.me/56987654321"');
    expect(html).not.toContain("wa.me/+56");
  });

  it("3. mailto: presente y escapado", () => {
    const html = renderSignatureHtml(sample({ email: "carlos@gard.cl" }));
    expect(html).toContain('href="mailto:carlos@gard.cl"');
  });

  it("4. Web sin protocolo → href https://gard.cl", () => {
    const html = renderSignatureHtml(sample({ website: "gard.cl" }));
    expect(html).toContain('href="https://gard.cl"');
  });

  it("5. Exactamente una imagen con logo (logo-left)", () => {
    const html = renderSignatureHtml(sample({ layout: "logo-left" }));
    expect(html.match(/<img\b/g)?.length ?? 0).toBe(1);
  });

  it("6. alt del logo = nombre de la empresa", () => {
    const html = renderSignatureHtml(sample({ company: "Gard Security" }));
    expect(html).toContain('alt="Gard Security"');
  });

  it("7. Salida sin <style> ni class=", () => {
    const html = renderSignatureHtml(sample());
    expect(html.toLowerCase()).not.toContain("<style");
    expect(html).not.toMatch(/\sclass=/);
  });

  it("8. script en fullName → escapado", () => {
    const html = renderSignatureHtml(
      sample({ fullName: "<script>alert(1)</script>" }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("9. & escapado como &amp;", () => {
    const html = renderSignatureHtml(sample({ fullName: "A & B" }));
    expect(html).toContain("A &amp; B");
  });

  it("10. layout text-only → cero imágenes", () => {
    const html = renderSignatureHtml(sample({ layout: "text-only" }));
    expect(html.match(/<img\b/g)?.length ?? 0).toBe(0);
  });

  it("11. layout text-only → conserva los 4 enlaces", () => {
    const html = renderSignatureHtml(sample({ layout: "text-only" }));
    expect(html).toContain("tel:+56987654321");
    expect(html).toContain("wa.me/56987654321");
    expect(html).toContain("mailto:carlos@gard.cl");
    expect(html).toContain('href="https://gard.cl"');
  });

  it("12. Teléfono 1234 → sin tel:, presente como texto", () => {
    const html = renderSignatureHtml(sample({ phone: "1234", whatsapp: undefined }));
    expect(html).not.toContain("tel:");
    expect(html).toContain("1234");
  });

  it("13. Render determinista", () => {
    const data = sample();
    expect(renderSignatureHtml(data)).toBe(renderSignatureHtml(data));
  });

  it("14. logoWidthPx 9999 → acotado a 240 (logo-top)", () => {
    const data = parseSignatureData({ fullName: "X", logoWidthPx: 9999 }, R2);
    expect(data.logoWidthPx).toBe(240);
    const html = renderSignatureHtml(
      sample({ logoWidthPx: 9999, layout: "logo-top" }),
    );
    expect(html).toContain("width:240px");
  });

  it("15. accentColor inválido → default #0f8f74", () => {
    const data = parseSignatureData(
      { fullName: "X", accentColor: "rojo" },
      R2,
    );
    expect(data.accentColor).toBe("#0f8f74");
  });

  it("16. layout raro → default logo-left", () => {
    const data = parseSignatureData({ fullName: "X", layout: "raro" }, R2);
    expect(data.layout).toBe("logo-left");
  });

  it("17. logoUrl fuera de R2_PUBLIC_URL → descartado", () => {
    const data = parseSignatureData(
      {
        fullName: "X",
        logoUrl: "https://evil.example/pixel.png",
      },
      R2,
    );
    expect(data.logoUrl).toBeUndefined();
  });

  it("18. fullName de 200 caracteres → recortado a 80", () => {
    const data = parseSignatureData(
      { fullName: "a".repeat(200) },
      R2,
    );
    expect(data.fullName.length).toBe(80);
  });

  it("19. parseSignatureData(null) y parseSignatureData(42) no lanzan", () => {
    expect(() => parseSignatureData(null)).not.toThrow();
    expect(() => parseSignatureData(42)).not.toThrow();
    expect(parseSignatureData(null).kind).toBe("structured");
    expect(parseSignatureData(42).fullName).toBe("");
  });

  it("20. Fijo de 9 dígitos 229876543 → +56229876543", () => {
    const html = renderSignatureHtml(
      sample({ phone: "229876543", whatsapp: undefined }),
    );
    expect(html).toContain('href="tel:+56229876543"');
  });

  it("21. Cargo y empresa en líneas separadas (sin ·)", () => {
    const html = renderSignatureHtml(
      sample({ role: "Director", company: "Gard Security" }),
    );
    expect(html).toContain(">Director</div>");
    expect(html).toContain(">Gard Security</div>");
    expect(html).not.toContain("Director · Gard");
  });

  it("22. websiteText personalizado se usa como label del enlace", () => {
    const html = renderSignatureHtml(
      sample({
        website: "calendar.app.google/MnLVKqBUZnxfoDzN8",
        websiteText: "Agenda una reunión",
      }),
    );
    expect(html).toContain("Agenda una reunión");
    expect(html).toContain('href="https://calendar.app.google/MnLVKqBUZnxfoDzN8"');
    expect(html).not.toContain(">calendar.app.google/");
  });

  it("23. Link de agenda sin websiteText → label por defecto", () => {
    const html = renderSignatureHtml(
      sample({
        website: "https://calendar.app.google/abc",
        websiteText: undefined,
      }),
    );
    expect(html).toContain("Agenda una reunión");
  });

  it("24. logo-left no usa max-width:100% (evita colapso) y acota ancho", () => {
    const html = renderSignatureHtml(
      sample({ layout: "logo-left", logoWidthPx: 226 }),
    );
    expect(html).toContain('width="140"');
    expect(html).toContain("width:140px");
    expect(html).not.toContain("max-width:100%");
  });

  it("25. logo-top respeta ancho pedido y alinea a la izquierda", () => {
    const html = renderSignatureHtml(
      sample({ layout: "logo-top", logoWidthPx: 226 }),
    );
    expect(html).toContain('width="226"');
    expect(html).toContain('align="left"');
    expect(html).toContain("text-align:left");
  });
});
