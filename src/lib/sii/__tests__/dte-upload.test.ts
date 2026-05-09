import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { uploadEnvioDteToSii, SII_UPLOAD_STATUS } from "../dte-upload";
import type { CertMaterial } from "../soap-client";

const dummyCert = {
  privateKeyPem: "",
  certificatePem: "",
  certBase64: "",
  publicKey: {} as CertMaterial["publicKey"],
};

describe("uploadEnvioDteToSii", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns trackId when SII responds STATUS=0", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<?xml version="1.0"?><RECEPCIONDTE><STATUS>0</STATUS><TRACKID>11998878336</TRACKID></RECEPCIONDTE>`,
    });

    const result = await uploadEnvioDteToSii({
      sobreXml: Buffer.from("<EnvioDTE/>"),
      cert: dummyCert,
      rutTitular: "11111111-1",
      rutEmisor: "22222222-2",
      environment: "PRODUCTION",
      token: "TESTTOKEN",
    });

    expect(result.trackId).toBe("11998878336");
    expect(result.status).toBe("0");
    expect(result.statusDescription).toBe("OK");
    expect(result.token).toBe("TESTTOKEN");
  });

  it("captures the no-autenticado payload when SII rejects", async () => {
    const errorBody = `<?xml version="1.0"?>
<RECEPCIONDTE>
 <RUTSENDER>0-0</RUTSENDER>
 <RUTCOMPANY>0-0</RUTCOMPANY>
 <FILE></FILE>
 <TIMESTAMP>0 0</TIMESTAMP>
 <STATUS>5</STATUS>
</RECEPCIONDTE>`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => errorBody,
    });

    const result = await uploadEnvioDteToSii({
      sobreXml: Buffer.from("<EnvioDTE/>"),
      cert: dummyCert,
      rutTitular: "11111111-1",
      rutEmisor: "22222222-2",
      environment: "PRODUCTION",
      token: "STALE",
    });

    expect(result.trackId).toBeNull();
    expect(result.status).toBe("5");
    expect(result.statusDescription).toBe(SII_UPLOAD_STATUS["5"]);
  });

  it("posts cert and company RUTs split with - separator", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<RECEPCIONDTE><STATUS>0</STATUS><TRACKID>1</TRACKID></RECEPCIONDTE>`,
    });
    global.fetch = fetchMock;

    await uploadEnvioDteToSii({
      sobreXml: Buffer.from("<EnvioDTE/>"),
      cert: dummyCert,
      rutTitular: "11111111-1",
      rutEmisor: "22222222-2",
      environment: "PRODUCTION",
      token: "TOKEN1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://palena.sii.cl/cgi_dte/UPL/DTEUpload");
    expect((init as RequestInit).headers).toMatchObject({
      Cookie: "TOKEN=TOKEN1",
    });
    const form = (init as RequestInit & { body: FormData }).body;
    expect(form.get("rutSender")).toBe("11111111");
    expect(form.get("dvSender")).toBe("1");
    expect(form.get("rutCompany")).toBe("22222222");
    expect(form.get("dvCompany")).toBe("2");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});
