/**
 * Tests del manejo de errores HTTP de SimpleAPI.
 *
 * El bug que motivó este test: SimpleAPI usa HTTP 401 con body vacío
 * tanto cuando la apikey es inválida como cuando el payload (cert/CAF)
 * es inválido. Antes el provider reportaba "dte/generar HTTP 401:" sin
 * pistas para el usuario. Ahora distingue ambos casos usando los
 * headers `x-rate-limit-*` que SimpleAPI emite SOLO cuando autenticó
 * la apikey correctamente.
 */

import { describe, expect, it } from "vitest";
import {
  detectApiKeyBlocked,
  isApiKeyAuthenticated,
  type SimpleApiResponse,
} from "../simpleapi-http";

function makeResponse(
  overrides: Partial<SimpleApiResponse> = {},
): SimpleApiResponse {
  return {
    ok: false,
    status: 401,
    bodyText: "",
    bodyJson: null,
    bodyBuffer: Buffer.alloc(0),
    rateLimit: { limit: null, remaining: null, reset: null },
    ...overrides,
  };
}

describe("isApiKeyAuthenticated", () => {
  it("devuelve true cuando SimpleAPI emite x-rate-limit-remaining (apikey reconocida)", () => {
    const res = makeResponse({
      rateLimit: { limit: "1m", remaining: 37, reset: "2026-05-06T15:38:16Z" },
    });
    expect(isApiKeyAuthenticated(res)).toBe(true);
  });

  it("devuelve false cuando SimpleAPI no emite headers de rate limit (apikey rechazada)", () => {
    const res = makeResponse({
      rateLimit: { limit: null, remaining: null, reset: null },
    });
    expect(isApiKeyAuthenticated(res)).toBe(false);
  });

  it("trata remaining=0 como apikey reconocida (sin cupo, no sin auth)", () => {
    const res = makeResponse({
      rateLimit: { limit: "1m", remaining: 0, reset: "2026-05-06T15:38:16Z" },
    });
    expect(isApiKeyAuthenticated(res)).toBe(true);
  });
});

describe("detectApiKeyBlocked", () => {
  it("no marca como bloqueada una respuesta OK", () => {
    const res = makeResponse({ ok: true, status: 200 });
    expect(detectApiKeyBlocked(res)).toEqual({
      blocked: false,
      reason: null,
      message: null,
    });
  });

  it("detecta rate limit con HTTP 429", () => {
    const res = makeResponse({ status: 429 });
    const r = detectApiKeyBlocked(res);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("RATE_LIMIT");
    expect(r.message).toContain("rate limit");
  });

  it("detecta apikey bloqueada por cupo cuando el body lo dice explícitamente", () => {
    const res = makeResponse({
      status: 401,
      bodyText: "Apikey bloqueada por límite mensual",
    });
    const r = detectApiKeyBlocked(res);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("QUOTA");
  });

  it("detecta apikey VENCIDA cuando SimpleAPI devuelve 'Apikey vencida'", () => {
    // Caso real reproducido contra servicios.simpleapi.cl/api/folios/get/33:
    // body = `{"error":"Apikey vencida. No es posible continuar"}` con HTTP 401.
    const res = makeResponse({
      status: 401,
      bodyText: '{"error":"Apikey vencida. No es posible continuar"}',
      bodyJson: { error: "Apikey vencida. No es posible continuar" },
    });
    const r = detectApiKeyBlocked(res);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("EXPIRED");
    expect(r.message).toContain("VENCIDA");
    expect(r.message).toContain("panel.simpleapi.cl");
  });

  it("también detecta variantes 'expirada' y 'expired' en el body", () => {
    const r1 = detectApiKeyBlocked(
      makeResponse({ status: 401, bodyText: "API key expirada" }),
    );
    expect(r1.reason).toBe("EXPIRED");
    const r2 = detectApiKeyBlocked(
      makeResponse({ status: 401, bodyText: "API key expired" }),
    );
    expect(r2.reason).toBe("EXPIRED");
  });

  it("NO marca como bloqueada un 401 con body vacío (puede ser error de payload)", () => {
    // Caso real reproducido contra api.simpleapi.cl: el endpoint
    // dte/generar devuelve 401 con body vacío cuando el payload es
    // inválido aunque la apikey esté activa.
    const res = makeResponse({
      status: 401,
      bodyText: "",
      rateLimit: { limit: "1m", remaining: 37, reset: "2026-05-06T15:38:16Z" },
    });
    expect(detectApiKeyBlocked(res).blocked).toBe(false);
  });

  it("NO marca como bloqueada un 401 con body que no menciona apikey", () => {
    const res = makeResponse({
      status: 401,
      bodyText: "Error procesando documento",
    });
    expect(detectApiKeyBlocked(res).blocked).toBe(false);
  });
});
