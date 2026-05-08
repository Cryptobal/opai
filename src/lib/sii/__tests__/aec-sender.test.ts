/**
 * Tests del AEC sender.
 *
 * Mockea `fetch` global y verifica:
 *   - URL correcta según env (cert/prod).
 *   - Header `Cookie: TOKEN=...` con el token inyectado.
 *   - Multipart con campos exactos (`emailNotif`, `rutCompany`, `dvCompany`, `archivo`).
 *   - RUT split correcto en cuerpo + DV (aplica también a DV K).
 *   - Parser laxo: acepta wrapper RECEPCIONAEC u otro nombre.
 *   - Parsea STATUS=0 + TRACKID (happy path).
 *   - Parsea STATUS != 0 + GLOSA (rechazo del SII).
 *   - HTTP no-OK sin XML válido → ok=false con httpStatus.
 *   - Body no parseable → ok=false con glosa autogenerada.
 *
 * NO pega al SII real. El smoke E2E (Paso D del HANDOFF) lo corre
 * Carlos manualmente con el cert real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const SAMPLE_AEC = Buffer.from(
  `<?xml version="1.0" encoding="ISO-8859-1"?><AEC xmlns="http://www.sii.cl/SiiDte" version="1.0"><Caratula/></AEC>`,
  "latin1",
);

const RECEPCION_OK = `<?xml version="1.0"?>
<RECEPCIONAEC>
  <RUTSENDER>11111111-1</RUTSENDER>
  <RUTCOMPANY>77840623-3</RUTCOMPANY>
  <FILE>AEC_test.xml</FILE>
  <TIMESTAMP>2026-05-08 10:00:00</TIMESTAMP>
  <STATUS>0</STATUS>
  <TRACKID>987654321</TRACKID>
</RECEPCIONAEC>`;

const RECEPCION_REJECT = `<?xml version="1.0"?>
<RECEPCIONAEC>
  <RUTSENDER>11111111-1</RUTSENDER>
  <RUTCOMPANY>77840623-3</RUTCOMPANY>
  <STATUS>8</STATUS>
  <GLOSA>Firma del documento no es valida</GLOSA>
</RECEPCIONAEC>`;

describe("sendAecToSii — request building", () => {
  it("usa host de CERTIFICATION (maullin.sii.cl) por defecto", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    await sendAecToSii({
      env: "CERTIFICATION",
      token: "TOKEN-123",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
      fileName: "AEC_test.xml",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://maullin.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi");
  });

  it("usa host de PRODUCTION (palena.sii.cl) cuando env=PRODUCTION", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    await sendAecToSii({
      env: "PRODUCTION",
      token: "TOKEN-123",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://palena.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi");
  });

  it("inyecta el token en el header Cookie como TOKEN=...", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    await sendAecToSii({
      env: "CERTIFICATION",
      token: "ABC-DEF-123",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Cookie).toBe("TOKEN=ABC-DEF-123");
  });

  it("split RUT cedente en cuerpo + DV en el FormData", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
      fileName: "AEC_test.xml",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("rutCompany")).toBe("77840623");
    expect(body.get("dvCompany")).toBe("3");
    expect(body.get("emailNotif")).toBe("facturacion@example.com");
    // El campo `archivo` es un File/Blob — no comparamos contenido,
    // verificamos que esté presente con el filename correcto.
    const archivo = body.get("archivo");
    expect(archivo).toBeTruthy();
    // En Node 20+ FormData.append(name, blob, filename) produce un File-like
    // con propiedad `name`. Algunos runtimes solo exponen Blob; aceptamos ambos.
    if (archivo && typeof archivo === "object" && "name" in archivo) {
      expect((archivo as File).name).toBe("AEC_test.xml");
    }
  });

  it("DV alfanumérico K se manda en mayúscula", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "12345678-k", // input minúscula
      emailNotif: "facturacion@example.com",
    });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("rutCompany")).toBe("12345678");
    expect(body.get("dvCompany")).toBe("K"); // splitRut() normaliza a mayúscula
  });

  it("genera un filename por defecto si no se pasa", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    const archivo = body.get("archivo");
    if (archivo && typeof archivo === "object" && "name" in archivo) {
      // Default fileName format: `AEC_<isoStrippedToHHMM>.xml`
      // (built con `new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)`).
      expect((archivo as File).name).toMatch(/^AEC_[\dT-]+\.xml$/);
    }
  });
});

describe("sendAecToSii — parser de respuesta", () => {
  it("STATUS=0 + TRACKID → ok=true con todos los campos parseados", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_OK));
    const { sendAecToSii } = await import("../aec-sender");
    const res = await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("0");
    expect(res.trackId).toBe("987654321");
    expect(res.rutSender).toBe("11111111-1");
    expect(res.rutCompany).toBe("77840623-3");
    expect(res.timestamp).toBe("2026-05-08 10:00:00");
    expect(res.httpStatus).toBe(200);
    expect(res.rawXml).toBe(RECEPCION_OK);
  });

  it("STATUS != 0 + GLOSA → ok=false con mensaje legible", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RECEPCION_REJECT));
    const { sendAecToSii } = await import("../aec-sender");
    const res = await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe("8");
    expect(res.glosa).toContain("Firma del documento no es valida");
    expect(res.trackId).toBeUndefined();
  });

  it("parser es laxo: acepta wrappers alternativos (RPETC_AEC)", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(
        `<?xml version="1.0"?><RPETC_AEC><STATUS>0</STATUS><TRACKID>4242</TRACKID></RPETC_AEC>`,
      ),
    );
    const { sendAecToSii } = await import("../aec-sender");
    const res = await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    expect(res.ok).toBe(true);
    expect(res.trackId).toBe("4242");
  });

  it("HTTP 500 sin XML válido → ok=false con httpStatus y glosa HTTP", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("Internal Server Error", 500));
    const { sendAecToSii } = await import("../aec-sender");
    const res = await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    expect(res.ok).toBe(false);
    expect(res.httpStatus).toBe(500);
    expect(res.glosa).toBe("HTTP 500");
    expect(res.rawXml).toBe("Internal Server Error");
  });

  it("body sin tags conocidos → ok=false con glosa explicativa", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse("<html><body>Service Unavailable</body></html>", 200),
    );
    const { sendAecToSii } = await import("../aec-sender");
    const res = await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBeUndefined();
    expect(res.trackId).toBeUndefined();
    expect(res.glosa).toContain("Respuesta SII no parseable");
  });

  it("network error → ok=false con httpStatus=0", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const { sendAecToSii } = await import("../aec-sender");
    const res = await sendAecToSii({
      env: "CERTIFICATION",
      token: "TKN",
      aecXml: SAMPLE_AEC,
      rutCedente: "77840623-3",
      emailNotif: "facturacion@example.com",
    });
    expect(res.ok).toBe(false);
    expect(res.httpStatus).toBe(0);
    expect(res.glosa).toContain("ECONNRESET");
  });
});
