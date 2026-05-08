/**
 * Tests del adapter directo de cesión SII (sin SimpleAPI).
 *
 * Mockea las dependencias internas (`signAec`, `getOrCreateSiiToken`,
 * `sendAecToSii`) para verificar el wiring puro: el adapter llama los
 * pasos en orden, mapea errores legibles, y produce el `DteCedeResponse`
 * correcto en el happy path y los failure cases.
 *
 * El builder real (`buildUnsignedAec`) sí se ejecuta — está cubierto
 * por sus propios tests (26) y queremos que el wiring se rompa si la
 * forma del input cambia accidentalmente.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DteCedeRequest } from "../dte-provider.adapter";
import type { SiiDirectCesionContext } from "../sii-direct-cesion";

// ── Mocks de los módulos sii ──
const signAecMock = vi.fn();
const getTokenMock = vi.fn();
const sendAecMock = vi.fn();

vi.mock("@/lib/sii/aec-signer", () => ({
  signAec: (...args: unknown[]) => signAecMock(...args),
}));
vi.mock("@/modules/finance/factoring/sii-soap.service", () => ({
  getOrCreateSiiToken: (...args: unknown[]) => getTokenMock(...args),
}));
vi.mock("@/lib/sii/aec-sender", () => ({
  sendAecToSii: (...args: unknown[]) => sendAecMock(...args),
}));

const SAMPLE_DTE_XML = Buffer.from(
  `<?xml version="1.0" encoding="ISO-8859-1"?>` +
    `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">` +
    `<Documento ID="F1689T33">` +
    `<Encabezado>` +
    `<IdDoc><TipoDTE>33</TipoDTE><Folio>1689</Folio><FchEmis>2026-05-07</FchEmis></IdDoc>` +
    `<Emisor><RUTEmisor>77777777-7</RUTEmisor><RznSoc>Cedente Demo SpA</RznSoc></Emisor>` +
    `<Receptor><RUTRecep>99999999-9</RUTRecep><RznSocRecep>Deudor Demo</RznSocRecep></Receptor>` +
    `<Totales><MntTotal>11900</MntTotal></Totales>` +
    `</Encabezado>` +
    `</Documento>` +
    `</DTE>`,
  "latin1",
);

function makeRequest(overrides: Partial<DteCedeRequest> = {}): DteCedeRequest {
  return {
    dteType: 33,
    dteFolio: 1689,
    dteIssuerRut: "77840623-3",
    dteReceiverRut: "99999999-9",
    dteReceiverName: "Deudor Demo SpA",
    dteDate: "2026-05-07",
    dteTotalAmount: 11900,
    dteXml: SAMPLE_DTE_XML,
    cesionarioRut: "88888888-8",
    cesionarioRazonSocial: "Factoring Demo SpA",
    cesionarioDireccion: "Av. Demo 2777",
    cesionarioEmail: "factoring@example.com",
    cedenteRazonSocial: "Cedente Demo SpA",
    cedenteDireccion: "Direccion Demo 100",
    cedenteEmail: "facturacion@example.com",
    rutAutorizadoNombre: "PERSONA AUTORIZADA DEMO",
    rutAutorizadoRut: "11111111-1",
    montoCesion: 11900,
    fechaUltimoVencimiento: "2026-07-06",
    contactNombre: "Contacto Demo",
    contactEmail: "contacto@example.com",
    ...overrides,
  };
}

function makeCtx(): SiiDirectCesionContext {
  return {
    environment: "CERTIFICATION",
    pfxBuffer: Buffer.from("dummy-pfx"),
    pfxPassword: "test-pwd",
    rutTitular: "11111111-1",
    emailNotif: "facturacion@example.com",
  };
}

/** Construye un AEC firmado de juguete que pasa el validator de mérito. */
function fakeSignedAec(): string {
  return (
    `<?xml version="1.0" encoding="ISO-8859-1"?>` +
    `<AEC xmlns="http://www.sii.cl/SiiDte" version="1.0">` +
    `<DocumentoAEC>` +
    `<Caratula/>` +
    `<Cesiones>` +
    `<Cesion><DocumentoCesion><Cedente><DeclaracionJurada>...Ley Nro 19.983...</DeclaracionJurada></Cedente></DocumentoCesion></Cesion>` +
    `</Cesiones>` +
    `</DocumentoAEC>` +
    `<Signature/><Signature/><Signature/>` +
    `</AEC>`
  );
}

beforeEach(() => {
  signAecMock.mockReset();
  getTokenMock.mockReset();
  sendAecMock.mockReset();
});
afterEach(() => {
  vi.resetModules();
});

describe("cedeDteSiiDirect — happy path", () => {
  it("devuelve success=true con trackId cuando todos los pasos OK", async () => {
    signAecMock.mockReturnValue(fakeSignedAec());
    getTokenMock.mockResolvedValue("TOKEN-TEST-123");
    sendAecMock.mockResolvedValue({
      ok: true,
      trackId: "987654321",
      status: "0",
      rawXml: "<RECEPCIONAEC><STATUS>0</STATUS><TRACKID>987654321</TRACKID></RECEPCIONAEC>",
      httpStatus: 200,
    });

    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(makeRequest(), makeCtx());

    expect(result.success).toBe(true);
    expect(result.trackId).toBe("987654321");
    expect(result.status).toBe("0");
    expect(result.aecXml).toBeInstanceOf(Buffer);
    expect(result.aecXml!.toString("latin1")).toContain("DocumentoAEC");
  });

  it("invoca los pasos en el orden: signAec → getToken → sendAec", async () => {
    const order: string[] = [];
    signAecMock.mockImplementation(() => {
      order.push("sign");
      return fakeSignedAec();
    });
    getTokenMock.mockImplementation(async () => {
      order.push("token");
      return "TKN";
    });
    sendAecMock.mockImplementation(async () => {
      order.push("send");
      return {
        ok: true,
        trackId: "1",
        status: "0",
        rawXml: "",
        httpStatus: 200,
      };
    });

    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    await cedeDteSiiDirect(makeRequest(), makeCtx());

    expect(order).toEqual(["sign", "token", "send"]);
  });

  it("propaga env y emailNotif del contexto al sender", async () => {
    signAecMock.mockReturnValue(fakeSignedAec());
    getTokenMock.mockResolvedValue("TKN");
    sendAecMock.mockResolvedValue({
      ok: true,
      trackId: "1",
      status: "0",
      rawXml: "",
      httpStatus: 200,
    });

    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    await cedeDteSiiDirect(makeRequest(), {
      ...makeCtx(),
      environment: "PRODUCTION",
      emailNotif: "alertas@example.com",
    });

    const sendInput = sendAecMock.mock.calls[0][0];
    expect(sendInput.env).toBe("PRODUCTION");
    expect(sendInput.emailNotif).toBe("alertas@example.com");
    expect(sendInput.token).toBe("TKN");
    expect(sendInput.rutCedente).toBe("77840623-3");
    expect(sendInput.fileName).toBe("AEC_1689.xml");
  });
});

describe("cedeDteSiiDirect — failure modes", () => {
  it("error de build: dteXml sin <DTE> → success=false sin llamar sender", async () => {
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(
      makeRequest({ dteXml: Buffer.from("garbage no DTE here", "latin1") }),
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Error construyendo AEC");
    expect(signAecMock).not.toHaveBeenCalled();
    expect(sendAecMock).not.toHaveBeenCalled();
  });

  it("error de signer: throws → success=false con mensaje del cert", async () => {
    signAecMock.mockImplementation(() => {
      throw new Error("PFX no contiene cert o privateKey válidos");
    });
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(makeRequest(), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("Error firmando AEC");
    expect(result.error).toContain("PFX no contiene cert");
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("validator falla: signer retorna XML sin DeclaracionJurada → success=false sin llamar sender", async () => {
    signAecMock.mockReturnValue(
      `<?xml version="1.0"?><AEC><DocumentoAEC><Cesiones/></DocumentoAEC><Signature/></AEC>`,
    );
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(makeRequest(), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("Ley 19.983");
    expect(result.aecXml).toBeInstanceOf(Buffer);
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(sendAecMock).not.toHaveBeenCalled();
  });

  it("error obteniendo token SII → success=false con mensaje del CrSeed", async () => {
    signAecMock.mockReturnValue(fakeSignedAec());
    getTokenMock.mockRejectedValue(new Error("CrSeed HTTP 503"));
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(makeRequest(), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("Error obteniendo token SII");
    expect(result.error).toContain("CrSeed HTTP 503");
    expect(sendAecMock).not.toHaveBeenCalled();
  });

  it("SII rechaza con STATUS != 0 → success=false con STATUS y GLOSA", async () => {
    signAecMock.mockReturnValue(fakeSignedAec());
    getTokenMock.mockResolvedValue("TKN");
    sendAecMock.mockResolvedValue({
      ok: false,
      status: "8",
      glosa: "Firma del documento no es valida",
      rawXml: "<RECEPCIONAEC><STATUS>8</STATUS><GLOSA>Firma del documento no es valida</GLOSA></RECEPCIONAEC>",
      httpStatus: 200,
    });
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(makeRequest(), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("STATUS=8");
    expect(result.error).toContain("Firma del documento no es valida");
    expect(result.error).toContain("HTTP=200");
    expect(result.aecXml).toBeInstanceOf(Buffer);
    expect(result.status).toBe("8");
  });

  it("SII OK pero sin TRACKID → success=false con head del body", async () => {
    signAecMock.mockReturnValue(fakeSignedAec());
    getTokenMock.mockResolvedValue("TKN");
    sendAecMock.mockResolvedValue({
      ok: true,
      // No trackId
      status: "0",
      rawXml: "<weird><STATUS>0</STATUS></weird>",
      httpStatus: 200,
    });
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(makeRequest(), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("sin TRACKID");
  });
});

describe("cedeDteSiiDirect — fallback de receiverName", () => {
  it("si dteReceiverName es undefined, usa el RUT en la declaración (no rompe)", async () => {
    signAecMock.mockReturnValue(fakeSignedAec());
    getTokenMock.mockResolvedValue("TKN");
    sendAecMock.mockResolvedValue({
      ok: true,
      trackId: "1",
      status: "0",
      rawXml: "",
      httpStatus: 200,
    });
    const { cedeDteSiiDirect } = await import("../sii-direct-cesion");
    const result = await cedeDteSiiDirect(
      makeRequest({ dteReceiverName: undefined }),
      makeCtx(),
    );
    // Lo importante: NO falla. El builder usa el RUT como fallback.
    expect(result.success).toBe(true);
  });
});
