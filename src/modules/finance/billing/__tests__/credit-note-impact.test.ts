import { describe, it, expect } from "vitest";
import { computeCreditNoteImpact } from "../credit-note-impact.helper";

describe("computeCreditNoteImpact", () => {
  it("sin NC parcial: devuelve totalAmount como grossPostNc", () => {
    const r = computeCreditNoteImpact({
      totalAmount: 9_346_473,
      netAmount: 7_854_178,
      creditedNetAmount: 0,
    });
    expect(r.grossPostNc).toBe(9_346_473);
    expect(r.creditedGross).toBe(0);
    expect(r.isFullyCredited).toBe(false);
  });

  it("NC parcial 12.7% sobre factura afecta: descuenta bruto proporcional con IVA", () => {
    // Caso real: Factura #1614 ($9.346.473 bruto, $7.854.178 neto)
    // NC #148 acredita $993.625 netos.
    // Bruto a descontar = 993.625 × (9.346.473 / 7.854.178) ≈ 1.182.414
    // Saldo remanente = 9.346.473 − 1.182.414 = 8.164.059
    const r = computeCreditNoteImpact({
      totalAmount: 9_346_473,
      netAmount: 7_854_178,
      creditedNetAmount: 993_625,
    });
    expect(r.creditedGross).toBe(1_182_414);
    expect(r.grossPostNc).toBe(8_164_059);
    expect(r.isFullyCredited).toBe(false);
  });

  it("NC parcial que cubre 100% del bruto: isFullyCredited=true y grossPostNc=0", () => {
    const r = computeCreditNoteImpact({
      totalAmount: 1_190_000,
      netAmount: 1_000_000,
      creditedNetAmount: 1_000_000,
    });
    expect(r.grossPostNc).toBe(0);
    expect(r.isFullyCredited).toBe(true);
  });

  it("NC parcial supera el bruto (over-credit): clampa a 0, no devuelve negativo", () => {
    const r = computeCreditNoteImpact({
      totalAmount: 1_190_000,
      netAmount: 1_000_000,
      creditedNetAmount: 1_500_000,
    });
    expect(r.grossPostNc).toBe(0);
    expect(r.isFullyCredited).toBe(true);
  });

  it("DTE exento (netAmount = 0): ratio 1, descuenta neto directo del bruto", () => {
    const r = computeCreditNoteImpact({
      totalAmount: 500_000,
      netAmount: 500_000,
      creditedNetAmount: 100_000,
    });
    expect(r.creditedGross).toBe(100_000);
    expect(r.grossPostNc).toBe(400_000);
  });

  it("netAmount = 0 con totalAmount > 0 (edge): asume ratio 1", () => {
    const r = computeCreditNoteImpact({
      totalAmount: 1_000_000,
      netAmount: 0,
      creditedNetAmount: 100_000,
    });
    expect(r.creditedGross).toBe(100_000);
    expect(r.grossPostNc).toBe(900_000);
  });

  it("creditedNetAmount negativo (data corrupta): trata como 0", () => {
    const r = computeCreditNoteImpact({
      totalAmount: 1_000_000,
      netAmount: 840_336,
      creditedNetAmount: -50_000,
    });
    expect(r.grossPostNc).toBe(1_000_000);
    expect(r.creditedGross).toBe(0);
    expect(r.isFullyCredited).toBe(false);
  });

  it("múltiples NCs acumuladas (creditedNetAmount = suma): trata como una sola", () => {
    // El endpoint NC suma cada NC parcial a creditedNetAmount.
    // Dos NCs de $500.000 net c/u sobre factura de $2.380.000 bruto / $2.000.000 net:
    // creditedNet = 1.000.000; ratio = 1,19; creditedGross = 1.190.000
    // grossPostNc = 2.380.000 − 1.190.000 = 1.190.000
    const r = computeCreditNoteImpact({
      totalAmount: 2_380_000,
      netAmount: 2_000_000,
      creditedNetAmount: 1_000_000,
    });
    expect(r.creditedGross).toBe(1_190_000);
    expect(r.grossPostNc).toBe(1_190_000);
  });
});
