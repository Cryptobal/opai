import { describe, expect, it } from "vitest";
import { buildEnvioEnviarPayload } from "../simpleapi.provider";

describe("buildEnvioEnviarPayload", () => {
  it("includes RutEmpresa so SII does not receive RUTCOMPANY 0-0", () => {
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
      RutEmpresa: "11111111-1",
      Certificado: {
        Rut: "22222222-2",
        Password: "secret",
      },
    });
  });
});
