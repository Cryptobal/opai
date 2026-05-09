import { describe, expect, it } from "vitest";
import { buildSobreEnvioPayload } from "../simpleapi.provider";

describe("buildSobreEnvioPayload", () => {
  it("includes RutEnvia and DTE subtotals for invoice envelopes", () => {
    const payload = buildSobreEnvioPayload({
      dteType: 33,
      environment: "PRODUCTION",
      emisorRut: "11111111-1",
      rutEnvia: "22222222-2",
      fechaResolucion: new Date("2014-08-22T00:00:00Z"),
      numeroResolucion: 80,
    });

    expect(payload).toMatchObject({
      Tipo: 1,
      Ambiente: 1,
      Caratula: {
        RutEmisor: "11111111-1",
        RutEnvia: "22222222-2",
        RutReceptor: "60803000-K",
        FechaResolucion: "2014-08-22",
        NumeroResolucion: 80,
        SubTotalesDTE: [{ TipoDTE: 33, NroDTE: 1 }],
      },
    });
  });

  it("keeps credit notes in EnvioDTE with their own subtotal", () => {
    const payload = buildSobreEnvioPayload({
      dteType: 61,
      environment: "CERTIFICATION",
      emisorRut: "11111111-1",
      rutEnvia: "22222222-2",
      fechaResolucion: new Date("2014-08-22T00:00:00Z"),
      numeroResolucion: 0,
    });

    expect(payload).toMatchObject({
      Tipo: 1,
      Ambiente: 0,
      Caratula: {
        RutEnvia: "22222222-2",
        SubTotalesDTE: [{ TipoDTE: 61, NroDTE: 1 }],
      },
    });
  });
});
