import { describe, expect, it } from "vitest";
import { interpretAcuseBody } from "../../shared/adapters/simpleapi-acuse";

describe("interpretAcuseBody", () => {
  it("acepta la confirmación positiva de SimpleAPI/SII", () => {
    expect(interpretAcuseBody({ descripcion: "Acción Completada OK." })).toEqual({
      success: true,
      description: "Acción Completada OK.",
    });
  });

  it("trata un evento ya registrado como éxito idempotente", () => {
    expect(interpretAcuseBody({ descripcion: "Evento registrado previamente." }).success).toBe(true);
  });

  it("rechaza un HTTP 200 cuyo cuerpo informa que venció el plazo SII", () => {
    expect(
      interpretAcuseBody({
        descripcion: "Pasados 8 días después de la recepción no es posible registrar reclamos o eventos.",
      }),
    ).toEqual({
      success: false,
      description: "Pasados 8 días después de la recepción no es posible registrar reclamos o eventos.",
    });
  });

  it("interpreta el código SII desde el XML serializado", () => {
    expect(
      interpretAcuseBody({ response: "<Respuesta><codRespuesta>0</codRespuesta></Respuesta>" }).success,
    ).toBe(true);
    expect(
      interpretAcuseBody({ response: "<Respuesta><codRespuesta>11</codRespuesta></Respuesta>" }).success,
    ).toBe(false);
  });
});
