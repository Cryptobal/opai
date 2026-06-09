/**
 * mapEnvelopeStatus — interpretación de la respuesta de consulta/envio.
 *
 * Regresión del bug que dejaba todos los DTEs congelados en Pendiente:
 * el SII responde `EPR` (Envío Procesado) a nivel de SOBRE y el resultado
 * por documento viene en el desglose `estados[]`.
 */
import { describe, expect, it } from "vitest";
import { mapEnvelopeStatus } from "../simpleapi.provider";

describe("mapEnvelopeStatus", () => {
  it("EPR + cantidadAceptados=1 → ACCEPTED (respuesta real de producción)", () => {
    expect(
      mapEnvelopeStatus("EPR", [
        {
          tipoDocumento: 33,
          cantidadInformados: 1,
          cantidadAceptados: 1,
          cantidadRechazados: 0,
          cantidadReparos: 0,
        },
      ]),
    ).toBe("ACCEPTED");
  });

  it("EPR + cantidadRechazados=1 → REJECTED (prioridad sobre aceptados)", () => {
    expect(
      mapEnvelopeStatus("EPR", [
        { cantidadAceptados: 1, cantidadRechazados: 1, cantidadReparos: 0 },
      ]),
    ).toBe("REJECTED");
  });

  it("EPR + cantidadReparos=1 → WITH_OBJECTIONS", () => {
    expect(
      mapEnvelopeStatus("EPR", [
        { cantidadAceptados: 0, cantidadRechazados: 0, cantidadReparos: 1 },
      ]),
    ).toBe("WITH_OBJECTIONS");
  });

  it("EPR sin desglose → SENT (sobre procesado, sin detalle aún)", () => {
    expect(mapEnvelopeStatus("EPR", undefined)).toBe("SENT");
    expect(mapEnvelopeStatus("EPR", [])).toBe("SENT");
    expect(
      mapEnvelopeStatus("EPR", [
        { cantidadAceptados: 0, cantidadRechazados: 0, cantidadReparos: 0 },
      ]),
    ).toBe("SENT");
  });

  it("acepta cantidades como string (variación de serialización)", () => {
    expect(
      mapEnvelopeStatus("EPR", [{ cantidadAceptados: "1" }]),
    ).toBe("ACCEPTED");
  });

  it("acepta claves PascalCase (CantidadAceptados)", () => {
    expect(
      mapEnvelopeStatus("EPR", [{ CantidadAceptados: 1 }]),
    ).toBe("ACCEPTED");
  });

  it("estados definitivos por string ignoran el desglose", () => {
    expect(mapEnvelopeStatus("RECHAZADO", [{ cantidadAceptados: 1 }])).toBe(
      "REJECTED",
    );
    expect(mapEnvelopeStatus("ACEPTADO", undefined)).toBe("ACCEPTED");
    expect(mapEnvelopeStatus("ANC", undefined)).toBe("ANNULLED");
  });

  it("estado desconocido sin desglose → PENDING", () => {
    expect(mapEnvelopeStatus("", undefined)).toBe("PENDING");
    expect(mapEnvelopeStatus(undefined, undefined)).toBe("PENDING");
  });

  it("estado desconocido CON desglose aceptado → ACCEPTED", () => {
    expect(
      mapEnvelopeStatus("", [{ cantidadAceptados: 1 }]),
    ).toBe("ACCEPTED");
  });
});
