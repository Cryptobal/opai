/**
 * Tests de `fx-sync`: verifica el flujo de fallback CMF → mindicador.cl
 * para UF y UTM. CMF queda bloqueada en el runtime de Vercel por IP, así
 * que el fallback es crítico para que el cron y el botón "Actualizar" del
 * widget CPQ funcionen en producción.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ufUpsert = vi.fn();
const utmUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fxUfRate: { upsert: ufUpsert, findUnique: vi.fn(), findFirst: vi.fn() },
    fxUtmRate: { upsert: utmUpsert, findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

// `todayChileStr()` usa Intl; fijamos un valor estable para el test.
vi.mock("@/lib/fx-date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fx-date")>("@/lib/fx-date");
  return {
    ...actual,
    todayChileStr: () => "2026-04-23",
  };
});

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

beforeEach(() => {
  ufUpsert.mockReset();
  utmUpsert.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.CMF_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function emptyResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => "",
  } as unknown as Response;
}

describe("fetchUfBestEffort", () => {
  it("usa CMF cuando responde bien", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ UFs: [{ Valor: "40.027,15", Fecha: "2026-04-23" }] }),
    );
    const { fetchUfBestEffort } = await import("../fx-sync");
    const res = await fetchUfBestEffort("2026-04-23");
    expect(res).toEqual({
      data: { value: 40027.15, date: "2026-04-23" },
      source: "CMF",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("api.cmfchile.cl");
  });

  it("cae a mindicador.cl cuando CMF devuelve UFs vacío", async () => {
    // CMF devuelve 200 pero sin UFs (caso que observamos en producción)
    fetchMock.mockResolvedValueOnce(okJson({ UFs: [] }));
    // mindicador responde con la serie histórica
    fetchMock.mockResolvedValueOnce(
      okJson({
        serie: [
          { fecha: "2026-04-23T04:00:00.000Z", valor: 40027.15 },
          { fecha: "2026-04-22T04:00:00.000Z", valor: 40013.88 },
        ],
      }),
    );

    const { fetchUfBestEffort } = await import("../fx-sync");
    const res = await fetchUfBestEffort("2026-04-23");
    expect(res).toEqual({
      data: { value: 40027.15, date: "2026-04-23" },
      source: "mindicador.cl",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("mindicador.cl");
  });

  it("cae a mindicador.cl cuando CMF tira error de red", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    fetchMock.mockResolvedValueOnce(
      okJson({
        serie: [{ fecha: "2026-04-23T04:00:00.000Z", valor: 40027.15 }],
      }),
    );

    const { fetchUfBestEffort } = await import("../fx-sync");
    const res = await fetchUfBestEffort("2026-04-23");
    expect(res?.source).toBe("mindicador.cl");
    expect(res?.data.value).toBe(40027.15);
  });

  it("retorna null si ambas fuentes fallan", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(500));
    fetchMock.mockResolvedValueOnce(emptyResponse(500));
    const { fetchUfBestEffort } = await import("../fx-sync");
    const res = await fetchUfBestEffort("2026-04-23");
    expect(res).toBeNull();
  });
});

describe("fetchUtmBestEffort", () => {
  it("usa CMF cuando responde bien", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ UTMs: [{ Valor: "69.889", Fecha: "2026-04-01" }] }),
    );
    const { fetchUtmBestEffort } = await import("../fx-sync");
    const res = await fetchUtmBestEffort();
    expect(res).toEqual({
      data: { value: 69889, month: "2026-04-01" },
      source: "CMF",
    });
  });

  it("cae a mindicador.cl cuando CMF devuelve UTMs vacío", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ UTMs: [] }));
    fetchMock.mockResolvedValueOnce(
      okJson({
        serie: [
          { fecha: "2026-04-01T03:00:00.000Z", valor: 69889 },
          { fecha: "2026-03-01T03:00:00.000Z", valor: 69611 },
        ],
      }),
    );
    const { fetchUtmBestEffort } = await import("../fx-sync");
    const res = await fetchUtmBestEffort();
    expect(res).toEqual({
      data: { value: 69889, month: "2026-04-01" },
      source: "mindicador.cl",
    });
  });
});

describe("forceRefreshFxRates", () => {
  it("persiste UF y UTM indicando la fuente real (CMF)", async () => {
    fetchMock
      // UF CMF
      .mockResolvedValueOnce(
        okJson({ UFs: [{ Valor: "40.027,15", Fecha: "2026-04-23" }] }),
      )
      // UTM CMF
      .mockResolvedValueOnce(
        okJson({ UTMs: [{ Valor: "69.889", Fecha: "2026-04-01" }] }),
      );

    const { forceRefreshFxRates } = await import("../fx-sync");
    const res = await forceRefreshFxRates();

    expect(res.uf.status).toBe("ok");
    expect(res.uf.source).toBe("CMF");
    expect(res.utm.status).toBe("ok");
    expect(res.utm.source).toBe("CMF");

    expect(ufUpsert).toHaveBeenCalledTimes(1);
    const ufCall = ufUpsert.mock.calls[0][0];
    expect(ufCall.create.source).toBe("CMF");
    expect(ufCall.update.source).toBe("CMF");
    expect(Number(ufCall.create.value)).toBe(40027.15);

    expect(utmUpsert).toHaveBeenCalledTimes(1);
    const utmCall = utmUpsert.mock.calls[0][0];
    expect(utmCall.create.source).toBe("CMF");
  });

  it("persiste con source=mindicador.cl cuando CMF falla y responde el fallback", async () => {
    // `fetchUfFromCmf` sin dateStr reintenta ayer si hoy falla (2 llamadas a CMF).
    fetchMock
      .mockResolvedValueOnce(okJson({ UFs: [] })) // UF CMF hoy
      .mockResolvedValueOnce(okJson({ UFs: [] })) // UF CMF ayer (retry interno)
      .mockResolvedValueOnce(
        okJson({
          serie: [{ fecha: "2026-04-23T04:00:00.000Z", valor: 40027.15 }],
        }),
      ) // UF mindicador
      .mockResolvedValueOnce(okJson({ UTMs: [] })) // UTM CMF
      .mockResolvedValueOnce(
        okJson({
          serie: [{ fecha: "2026-04-01T03:00:00.000Z", valor: 69889 }],
        }),
      ); // UTM mindicador

    const { forceRefreshFxRates } = await import("../fx-sync");
    const res = await forceRefreshFxRates();

    expect(res.uf.source).toBe("mindicador.cl");
    expect(res.utm.source).toBe("mindicador.cl");

    expect(ufUpsert.mock.calls[0][0].create.source).toBe("mindicador.cl");
    expect(utmUpsert.mock.calls[0][0].create.source).toBe("mindicador.cl");
  });

  it("devuelve no_data cuando nadie responde y NO upsertea", async () => {
    // 2 calls CMF UF (hoy + ayer retry) + 1 mindicador UF + 1 CMF UTM + 1 mindicador UTM
    fetchMock
      .mockResolvedValueOnce(emptyResponse(500))
      .mockResolvedValueOnce(emptyResponse(500))
      .mockResolvedValueOnce(emptyResponse(500))
      .mockResolvedValueOnce(emptyResponse(500))
      .mockResolvedValueOnce(emptyResponse(500));

    const { forceRefreshFxRates } = await import("../fx-sync");
    const res = await forceRefreshFxRates();

    expect(res.uf.status).toBe("no_data");
    expect(res.utm.status).toBe("no_data");
    expect(ufUpsert).not.toHaveBeenCalled();
    expect(utmUpsert).not.toHaveBeenCalled();
  });
});
