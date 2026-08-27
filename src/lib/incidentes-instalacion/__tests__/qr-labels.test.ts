// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertLoteQuantity,
  formatLoteCode,
  formatSerialLabel,
  MAX_LOTE_QUANTITY,
  nextLoteSeqFromCodes,
  parseSerialLabel,
} from "../qr-labels";

describe("formatSerialLabel", () => {
  it("rellena a 5 dígitos", () => {
    expect(formatSerialLabel(1)).toBe("QR-00001");
    expect(formatSerialLabel(47)).toBe("QR-00047");
    expect(formatSerialLabel(123456)).toBe("QR-123456");
  });
});

describe("parseSerialLabel", () => {
  it("lee el serial numérico", () => {
    expect(parseSerialLabel("QR-00047")).toBe(47);
    expect(parseSerialLabel("qr-12")).toBe(12);
    expect(parseSerialLabel("nope")).toBeNull();
  });
});

describe("formatLoteCode / nextLoteSeqFromCodes", () => {
  it("usa YYYYMM de Chile y secuencia", () => {
    const now = new Date("2026-08-27T15:00:00.000Z");
    expect(formatLoteCode(1, now)).toBe("L-202608-001");
    expect(formatLoteCode(12, now)).toBe("L-202608-012");
  });

  it("incrementa solo códigos del mes actual", () => {
    const now = new Date("2026-08-27T15:00:00.000Z");
    expect(nextLoteSeqFromCodes(["L-MIGRACION", "L-202607-009", "L-202608-002"], now)).toBe(3);
    expect(nextLoteSeqFromCodes([], now)).toBe(1);
  });
});

describe("assertLoteQuantity", () => {
  it("acepta 1–100", () => {
    expect(() => assertLoteQuantity(1)).not.toThrow();
    expect(() => assertLoteQuantity(MAX_LOTE_QUANTITY)).not.toThrow();
    expect(() => assertLoteQuantity(0)).toThrow(/cantidad/);
    expect(() => assertLoteQuantity(101)).toThrow(/cantidad/);
    expect(() => assertLoteQuantity(1.5)).toThrow(/cantidad/);
  });
});
