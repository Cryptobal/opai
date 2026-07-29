import { describe, expect, it } from "vitest";
import {
  DOC_TEXT_MAX_PER_FILE,
  truncateDocText,
} from "../document-text-budget";

describe("truncateDocText", () => {
  it("sin truncado cuando el texto cabe", () => {
    const full = "hola mundo";
    const r = truncateDocText(full, 100);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(full);
    expect(r.totalLength).toBe(10);
    expect(r.nextOffset).toBeNull();
  });

  it("con truncado deja marcador y nextOffset", () => {
    const full = "a".repeat(100);
    const r = truncateDocText(full, 40, { label: "pliego.pdf" });
    expect(r.truncated).toBe(true);
    expect(r.nextOffset).toBe(40);
    expect(r.totalLength).toBe(100);
    expect(r.text.startsWith("a".repeat(40))).toBe(true);
    expect(r.text).toContain("documento truncado");
    expect(r.text).toContain("offset=40");
    expect(r.text).toContain("pliego.pdf");
    expect(r.text).toContain("0–40 de 100");
  });

  it("con offset pagina el resto del documento", () => {
    const full = "0123456789ABCDEFGHIJ"; // 20
    const page1 = truncateDocText(full, 10);
    expect(page1.nextOffset).toBe(10);
    expect(page1.text.startsWith("0123456789")).toBe(true);

    const page2 = truncateDocText(full, 10, { offset: page1.nextOffset! });
    expect(page2.truncated).toBe(false);
    expect(page2.nextOffset).toBeNull();
    expect(page2.text).toBe("ABCDEFGHIJ");
  });

  it("offset fuera de rango devuelve vacío y nextOffset null", () => {
    const full = "corto";
    const r = truncateDocText(full, 100, { offset: 999 });
    expect(r.text).toBe("");
    expect(r.truncated).toBe(false);
    expect(r.nextOffset).toBeNull();
    expect(r.totalLength).toBe(5);
  });

  it("offset negativo se trata como 0", () => {
    const full = "abcdef";
    const r = truncateDocText(full, 3, { offset: -10 });
    expect(r.text.startsWith("abc")).toBe(true);
    expect(r.nextOffset).toBe(3);
  });

  it("presupuesto por archivo por defecto es 60k", () => {
    expect(DOC_TEXT_MAX_PER_FILE).toBe(60_000);
  });
});
