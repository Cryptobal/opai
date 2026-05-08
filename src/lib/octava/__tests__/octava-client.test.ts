/**
 * Sin red: comportamiento HTTP/JSON del cliente Octava con fetch mockeado.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  obtenerToken,
  OctavaApiError,
  registraCedente,
} from "../octava-client";

describe("octava-client", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("obtenerToken parsea respuesta TOK", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "exito",
          message: "metodo ejecutado",
          DescripcionResultado: "TOK",
          Token: "abc123",
          TiempoEjecucion: 0.1,
          FechaHoraRegistro: "2026-01-01",
        }),
    } as Response);

    const res = await obtenerToken({
      RUTACCESOAPI: "12345678-9",
      PASSWORDACCESOAPI: "secret",
    });
    expect(res.DescripcionResultado).toBe("TOK");
    expect(res.Token).toBe("abc123");
  });

  it("registraCedente parsea IdResultadoFE 3 sin PassAccesoApi", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "exito",
          message: "metodo ejecutado",
          IdResultadoFE: "3",
          ResultadoFE: "Empresa No Creada, ya existe RUT en nuestros registros.",
          PassAccesoApi: "",
        }),
    } as Response);

    const res = await registraCedente({
      RUT: "99999999-9",
      RAZONSOCIAL: "Ejemplo SPA",
      RUTAUTORIZADOSII: "88888888-8",
      NOMBREAUTORIZADOSII: "Juan",
      CERTDIGBASE64: "YQ==",
      PASSCERTDIG: "pfx",
      INTEGRADOR: "60803000-K",
      PASSWORDINTEGRADOR: "pw",
    });
    expect(res.IdResultadoFE).toBe("3");
    expect(res.PassAccesoApi).toBe("");
  });

  it("OctavaApiError ante HTTP no JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    } as Response);

    await expect(
      obtenerToken({
        RUTACCESOAPI: "x",
        PASSWORDACCESOAPI: "y",
      }),
    ).rejects.toThrow(OctavaApiError);
  });
});
