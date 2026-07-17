import { describe, it, expect } from "vitest";
import { formatFacturaEmisionRule } from "../format-factura-emision";

describe("formatFacturaEmisionRule", () => {
  it("mensual AL_EMITIR: mismo día", () => {
    expect(
      formatFacturaEmisionRule({
        frequency: "monthly",
        facturaTiming: "AL_EMITIR",
      }),
    ).toEqual({ text: "Mismo día", deferred: false });
  });

  it("mensual sin timing explícito: mismo día", () => {
    expect(formatFacturaEmisionRule({ frequency: "monthly" })).toEqual({
      text: "Mismo día",
      deferred: false,
    });
  });

  it("DIA_ESPECIFICO + MES_SIGUIENTE", () => {
    expect(
      formatFacturaEmisionRule({
        frequency: "monthly",
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: 5,
        facturaMesRelativo: "MES_SIGUIENTE",
      }),
    ).toEqual({ text: "Día 5 · mes siguiente", deferred: true });
  });

  it("DIA_ESPECIFICO + MISMO_MES + último día", () => {
    expect(
      formatFacturaEmisionRule({
        frequency: "monthly",
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: -1,
        facturaMesRelativo: "MISMO_MES",
      }),
    ).toEqual({ text: "Último día · mismo mes", deferred: true });
  });

  it("semanal: siempre mismo día aunque haya timing en DB", () => {
    expect(
      formatFacturaEmisionRule({
        frequency: "weekly",
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: 5,
        facturaMesRelativo: "MES_SIGUIENTE",
      }),
    ).toEqual({ text: "Mismo día", deferred: false });
  });
});
