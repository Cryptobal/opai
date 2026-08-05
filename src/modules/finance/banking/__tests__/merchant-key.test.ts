import { describe, it, expect } from "vitest";
import {
  deriveMerchantKey,
  isForbiddenNeedle,
  MERCHANT_NEEDLE_MIN_LEN,
} from "../merchant-key";

describe("deriveMerchantKey", () => {
  it("agrupa variantes VERCEL bajo el mismo key", () => {
    const a = deriveMerchantKey("Compra VERCEL MKT NEON");
    const b = deriveMerchantKey("Compra VERCEL INC.");
    expect(a?.key).toBe("M:VERCEL");
    expect(b?.key).toBe("M:VERCEL");
    expect(a?.needle).toBe("VERCEL");
  });

  it("extrae SLACK ignorando sufijo de workspace", () => {
    const m = deriveMerchantKey("Compra SLACK T06FG8K2M");
    expect(m?.key).toBe("M:SLACK");
  });

  it("no incluye RUT en el needle de transferencias", () => {
    const m = deriveMerchantKey("TRANSFERENCIA A 76.123.456-7 JUAN PEREZ");
    expect(m).not.toBeNull();
    expect(m!.needle).not.toMatch(/76|123|456/);
    expect(m!.needle).toContain("JUAN");
  });

  it("rechaza glosas genéricas", () => {
    expect(deriveMerchantKey("PAGO")).toBeNull();
    expect(deriveMerchantKey("Cargo 12345678")).toBeNull();
  });

  it("es estable ante mayúsculas/minúsculas y tildes", () => {
    const a = deriveMerchantKey("compra vércel mkt");
    const b = deriveMerchantKey("COMPRA VERCEL MKT");
    expect(a?.key).toBe(b?.key);
    expect(a?.key).toBe("M:VERCEL");
  });

  it("isForbiddenNeedle y longitud mínima", () => {
    expect(MERCHANT_NEEDLE_MIN_LEN).toBe(4);
    expect(isForbiddenNeedle("compra")).toBe(true);
    expect(isForbiddenNeedle("VERCEL")).toBe(false);
  });
});
