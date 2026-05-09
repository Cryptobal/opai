import { describe, expect, it } from "vitest";
import { buildEnvioEnviarPayload } from "../simpleapi.provider";

describe("buildEnvioEnviarPayload", () => {
  it("includes sender and company RUTs so SII does not receive 0-0 values", () => {
    expect(
      buildEnvioEnviarPayload({
        dteType: 61,
        environment: "PRODUCTION",
        emisorRut: "11111111-1",
        rutTitular: "22222222-2",
        password: "secret",
      }),
    ).toEqual({
      Tipo: 1,
      Ambiente: 1,
      RutEnvia: "22222222-2",
      RutEmpresa: "11111111-1",
      Certificado: {
        Rut: "22222222-2",
        Password: "secret",
      },
    });
  });
});
