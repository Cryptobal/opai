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
  describeSimpleApiError,
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

describe("describeSimpleApiError", () => {
  it("incluye el endpoint y el status en el mensaje base", () => {
    const res = makeResponse({ status: 500, bodyText: "boom" });
    const msg = describeSimpleApiError("envio/enviar", res);
    expect(msg).toContain("envio/enviar");
    expect(msg).toContain("HTTP 500");
    expect(msg).toContain("boom");
  });

  it("para 401 con apikey reconocida, da diagnóstico de cert/CAF", () => {
    const res = makeResponse({
      status: 401,
      bodyText: "",
      rateLimit: { limit: "1m", remaining: 37, reset: "2026-05-06T15:38:16Z" },
    });
    const msg = describeSimpleApiError("dte/generar", res);
    expect(msg).toContain("apikey reconocida");
    expect(msg).toContain("certificado digital");
    expect(msg).toContain("CAF");
  });

  it("para 401 sin body y sin rate-limit headers, apunta a SIMPLEAPI_KEY", () => {
    const res = makeResponse({
      status: 401,
      bodyText: "",
      rateLimit: { limit: null, remaining: null, reset: null },
    });
    const msg = describeSimpleApiError("dte/generar", res);
    expect(msg).toContain("SIMPLEAPI_KEY");
    expect(msg).toContain("panel.simpleapi.cl");
  });

  it("para 404 en endpoint de cesión, sugiere problema de plan SimpleAPI (Ley 19.983)", () => {
    // Caso real reportado en producción: SimpleAPI devolvió 404 con body
    // vacío al llamar dte/cesion/generar. El plan contratado no incluía
    // cesión electrónica.
    const res = makeResponse({
      status: 404,
      bodyText: "",
      rateLimit: { limit: "1m", remaining: 12, reset: "2026-05-07T22:00:00Z" },
    });
    const msg = describeSimpleApiError("dte/cesion/generar", res);
    expect(msg).toContain("HTTP 404");
    expect(msg).toContain("dte/cesion/generar");
    expect(msg).toContain("plan");
    expect(msg).toContain("cesión");
    expect(msg).toContain("panel.simpleapi.cl");
    expect(msg).toContain("apikey reconocida");
  });

  it("para 404 en endpoint NO de cesión, sugiere SIMPLEAPI_BASE_URL mal configurada", () => {
    const res = makeResponse({
      status: 404,
      bodyText: "",
      rateLimit: { limit: null, remaining: null, reset: null },
    });
    const msg = describeSimpleApiError("dte/generar", res);
    expect(msg).toContain("HTTP 404");
    expect(msg).toContain("SIMPLEAPI_BASE_URL");
    expect(msg).toContain("api.simpleapi.cl");
    expect(msg).toContain("servicios.simpleapi.cl");
    expect(msg).not.toContain("apikey reconocida");
  });

  it("para 404 con body, incluye el detalle del provider", () => {
    const res = makeResponse({
      status: 404,
      bodyText: '{"mensaje":"endpoint no disponible para este plan"}',
    });
    const msg = describeSimpleApiError("cesion/enviar", res);
    expect(msg).toContain("HTTP 404");
    expect(msg).toContain("endpoint no disponible");
  });

  it("para apikey vencida (caso EXPIRED), prioriza el mensaje de bloqueo sobre el genérico", () => {
    const res = makeResponse({
      status: 401,
      bodyText: '{"error":"Apikey vencida. No es posible continuar"}',
    });
    const msg = describeSimpleApiError("dte/generar", res);
    expect(msg).toContain("VENCIDA");
    expect(msg).toContain("dte/generar");
  });
});
