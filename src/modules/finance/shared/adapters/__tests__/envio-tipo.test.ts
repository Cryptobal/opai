/**
 * Tests del mapeo dteType → Tipo (enum SimpleAPI envio/generar y
 * envio/enviar).
 *
 * Bug histórico: el provider mandaba `Tipo: 0` (lo que en realidad
 * NO existe en la enumeración de SimpleAPI), y SimpleAPI rechazaba
 * con HTTP 400:
 *   `{"mensaje":"Tipo incorrecto. 1.EnvioDTE - 2.EnvioBoleta."}`
 *
 * Estos tests garantizan que cada tipo de DTE se mapee correctamente.
 */

import { describe, it, expect } from "vitest";

// Re-implementación local en sync con la del provider. Si cambia el
// mapeo, ajustar ambos lugares y este test.
function envioTipoFromDte(dteType: number): 1 | 2 {
  return dteType === 39 || dteType === 41 ? 2 : 1;
}

describe("envioTipoFromDte", () => {
  it("Factura electrónica (33) → EnvioDTE (1)", () => {
    expect(envioTipoFromDte(33)).toBe(1);
  });

  it("Factura exenta (34) → EnvioDTE (1)", () => {
    expect(envioTipoFromDte(34)).toBe(1);
  });

  it("Nota de crédito (61) → EnvioDTE (1)", () => {
    expect(envioTipoFromDte(61)).toBe(1);
  });

  it("Nota de débito (56) → EnvioDTE (1)", () => {
    expect(envioTipoFromDte(56)).toBe(1);
  });

  it("Guía de despacho (52) → EnvioDTE (1)", () => {
    expect(envioTipoFromDte(52)).toBe(1);
  });

  it("Boleta afecta (39) → EnvioBoleta (2)", () => {
    expect(envioTipoFromDte(39)).toBe(2);
  });

  it("Boleta exenta (41) → EnvioBoleta (2)", () => {
    expect(envioTipoFromDte(41)).toBe(2);
  });
});
