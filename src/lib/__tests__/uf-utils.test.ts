import { describe, it, expect } from "vitest";
import {
  roundUfTo2,
  ufToClpNet,
  resolveUfPriceBreakdown,
  formatUfDateDmy,
} from "../uf-utils";

describe("roundUfTo2", () => {
  it("deja 2 decimales intactos", () => {
    expect(roundUfTo2(163.21)).toBe(163.21);
  });

  it("half-up desde 4 decimales", () => {
    expect(roundUfTo2(163.2052)).toBe(163.21);
    expect(roundUfTo2(26.3158)).toBe(26.32);
  });

  it("entero queda en .00 numérico", () => {
    expect(roundUfTo2(40)).toBe(40);
  });

  it("no-finito → 0", () => {
    expect(roundUfTo2(Number.NaN)).toBe(0);
    expect(roundUfTo2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("ufToClpNet", () => {
  it("redondea el neto CLP después de 2 decimales de UF", () => {
    expect(ufToClpNet(163.2052, 40_874)).toBe(6_671_046);
  });

  it("T/C 0 o vacío → 0", () => {
    expect(ufToClpNet(40, 0)).toBe(0);
  });
});

describe("resolveUfPriceBreakdown", () => {
  it("arma el desglose con UF persistida y CLP calculado", () => {
    const r = resolveUfPriceBreakdown({
      amountUf: 40,
      ufValue: 38_000,
    });
    expect(r).toEqual({
      amountUf: 40,
      ufValue: 38_000,
      clp: 1_520_000,
      priceEdited: false,
      ufValueInferred: false,
    });
  });

  it("marca priceEdited si el CLP guardado no coincide con el cálculo", () => {
    const r = resolveUfPriceBreakdown({
      amountUf: 40,
      ufValue: 38_000,
      unitPriceClp: 1_500_000,
    });
    expect(r?.priceEdited).toBe(true);
    expect(r?.clp).toBe(1_500_000);
  });

  it("infiere el valor UF desde el CLP cuando no hay ufValue", () => {
    const r = resolveUfPriceBreakdown({
      amountUf: 118.9,
      unitPriceClp: 4_696_396,
    });
    expect(r?.ufValueInferred).toBe(true);
    expect(r?.amountUf).toBe(118.9);
    expect(r?.clp).toBe(4_696_396);
    expect(r?.ufValue).toBe(Math.round((4_696_396 / 118.9) * 100) / 100);
  });

  it("sin monto UF válido retorna null", () => {
    expect(resolveUfPriceBreakdown({ amountUf: 0, ufValue: 38_000 })).toBeNull();
    expect(resolveUfPriceBreakdown({ amountUf: null, ufValue: 38_000 })).toBeNull();
  });
});

describe("formatUfDateDmy", () => {
  it("formatea Date UTC como DD/MM/YYYY", () => {
    expect(formatUfDateDmy(new Date(Date.UTC(2026, 7, 31)))).toBe("31/08/2026");
  });

  it("acepta ISO string", () => {
    expect(formatUfDateDmy("2026-08-31T00:00:00.000Z")).toBe("31/08/2026");
  });

  it("null / inválido → null", () => {
    expect(formatUfDateDmy(null)).toBeNull();
    expect(formatUfDateDmy("nope")).toBeNull();
  });
});
