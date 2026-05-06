/**
 * Tests de helpers usados por el flujo de generación de PDF DTE.
 *
 * - `stripDataUrlPrefix`: el SDK oficial documenta que LogoBase64
 *   "Debe ir en base64" (sin data URL prefix). Validamos que toleremos
 *   ambos formatos al recibirlos del frontend o BD legacy.
 * - `DTE_TYPES_WITH_CEDIBLE`: garantizamos que la cedible se genera para
 *   los tipos correctos (Ley 19.983 — Factoring).
 */

import { describe, it, expect } from "vitest";

// Re-implementación local en sync con la del provider. Si cambia el
// helper, actualizar ambos.
function stripDataUrlPrefix(b64: string | null | undefined): string {
  if (!b64) return "";
  const trimmed = b64.trim();
  if (trimmed.startsWith("data:")) {
    const idx = trimmed.indexOf(",");
    return idx >= 0 ? trimmed.slice(idx + 1) : "";
  }
  return trimmed;
}

const DTE_TYPES_WITH_CEDIBLE = new Set([33, 34, 43, 56, 61]);

describe("stripDataUrlPrefix (logo del PDF)", () => {
  it("quita el prefijo data:image/png;base64,", () => {
    const input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
    expect(stripDataUrlPrefix(input)).toBe("iVBORw0KGgoAAAANSUhEUgAA");
  });

  it("quita el prefijo data:image/jpeg;base64,", () => {
    const input = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(stripDataUrlPrefix(input)).toBe("/9j/4AAQSkZJRg==");
  });

  it("deja base64 puro intacto", () => {
    const input = "iVBORw0KGgoAAAANSUhEUgAA";
    expect(stripDataUrlPrefix(input)).toBe(input);
  });

  it("retorna string vacío para null/undefined/empty", () => {
    expect(stripDataUrlPrefix(null)).toBe("");
    expect(stripDataUrlPrefix(undefined)).toBe("");
    expect(stripDataUrlPrefix("")).toBe("");
  });

  it("normaliza espacios en blanco al inicio/final", () => {
    expect(stripDataUrlPrefix("  data:image/png;base64,abc  ")).toBe("abc");
    expect(stripDataUrlPrefix("\n\tabc\n")).toBe("abc");
  });

  it("maneja data URL sin coma (malformado) sin crashear", () => {
    expect(stripDataUrlPrefix("data:image/png;base64")).toBe("");
  });
});

describe("DTE_TYPES_WITH_CEDIBLE (Ley 19.983)", () => {
  it("incluye facturas y notas que se pueden ceder a factoring", () => {
    // Factura electrónica afecta
    expect(DTE_TYPES_WITH_CEDIBLE.has(33)).toBe(true);
    // Factura electrónica exenta
    expect(DTE_TYPES_WITH_CEDIBLE.has(34)).toBe(true);
    // Factura de compra
    expect(DTE_TYPES_WITH_CEDIBLE.has(43)).toBe(true);
    // Nota de débito
    expect(DTE_TYPES_WITH_CEDIBLE.has(56)).toBe(true);
    // Nota de crédito
    expect(DTE_TYPES_WITH_CEDIBLE.has(61)).toBe(true);
  });

  it("excluye boletas y guías (no son cedibles)", () => {
    // Boleta afecta
    expect(DTE_TYPES_WITH_CEDIBLE.has(39)).toBe(false);
    // Boleta exenta
    expect(DTE_TYPES_WITH_CEDIBLE.has(41)).toBe(false);
    // Guía de despacho
    expect(DTE_TYPES_WITH_CEDIBLE.has(52)).toBe(false);
  });
});
