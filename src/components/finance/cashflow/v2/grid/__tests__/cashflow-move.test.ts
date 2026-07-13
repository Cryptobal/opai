/**
 * Tests del router de `moveViaApi`: verifica que un `itemId` sintético
 * (`_dte:`, `_orphan`, `_periodic`) — el que `buildRows` asigna a filas sin
 * FinanceCashflowItem real — NO se envíe a la rama `itemId` (upsert-and-act,
 * cuyo Zod exige uuid → 400 "Invalid UUID"), sino que caiga a la rama `dteId`
 * (dtes/[dteId]/move) cuando hay DTE. El caso normal (itemId uuid real) debe
 * seguir yendo a upsert-and-act sin cambios.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { moveViaApi } from "../cashflow-move";

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

function okJson(body: unknown = { success: true }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

const REAL_DTE_UUID = "11111111-1111-4111-8111-111111111111";
const REAL_ITEM_UUID = "22222222-2222-4222-8222-222222222222";
const originalDate = "2026-07-06";
const newDate = "2026-07-13";

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okJson());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moveViaApi — itemId sintético", () => {
  it("factura huérfana (_dte:) con dteId → usa ruta dtes/[dteId]/move, NO upsert-and-act", async () => {
    const res = await moveViaApi({
      occurrenceId: null,
      itemId: `_dte:${REAL_DTE_UUID}`,
      dteId: REAL_DTE_UUID,
      originalDate,
      newDate,
    });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/finance/cashflow/dtes/${REAL_DTE_UUID}/move`);
    // Nunca debe tocar upsert-and-act con el texto sintético.
    expect(url).not.toContain("upsert-and-act");
  });

  it("_orphan sin dteId ni occurrenceId → { ok:false } y NO llama a fetch", async () => {
    const res = await moveViaApi({
      occurrenceId: null,
      itemId: "_orphan",
      dteId: null,
      originalDate,
      newDate,
    });

    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("_periodic con dteId → cae a la rama dteId (no manda texto sintético a upsert-and-act)", async () => {
    const res = await moveViaApi({
      occurrenceId: null,
      itemId: "_periodic:RECURRING_DTE",
      dteId: REAL_DTE_UUID,
      originalDate,
      newDate,
    });

    expect(res.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/finance/cashflow/dtes/${REAL_DTE_UUID}/move`);
  });
});

describe("moveViaApi — itemId real (caso normal, sin cambios)", () => {
  it("itemId uuid real sin dteId → sigue yendo a upsert-and-act", async () => {
    const res = await moveViaApi({
      occurrenceId: null,
      itemId: REAL_ITEM_UUID,
      dteId: null,
      originalDate,
      newDate,
    });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/finance/cashflow/occurrences/upsert-and-act");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.itemId).toBe(REAL_ITEM_UUID);
    expect(body.action).toBe("move");
  });

  it("itemId uuid real CON dteId (factura EXTRA) → usa dtes/[dteId]/move", async () => {
    const res = await moveViaApi({
      occurrenceId: null,
      itemId: REAL_ITEM_UUID,
      dteId: REAL_DTE_UUID,
      originalDate,
      newDate,
    });

    expect(res.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/finance/cashflow/dtes/${REAL_DTE_UUID}/move`);
  });
});
