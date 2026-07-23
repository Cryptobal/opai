import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetGmailQuotaForTests,
  isRetryableGmailError,
  retryAfterMs,
  runWithGmailQuota,
  wrapGmailClientWithQuota,
} from "../gmail-adapter";
import { parseBatchResponseBodies } from "../gmail-batch";
import type { gmail_v1 } from "googleapis";

beforeEach(() => {
  __resetGmailQuotaForTests();
});

describe("isRetryableGmailError", () => {
  it("429 y 5xx son reintentables", () => {
    expect(isRetryableGmailError({ code: 429 })).toBe(true);
    expect(isRetryableGmailError({ response: { status: 503 } })).toBe(true);
  });

  it("403 solo si es de cuota", () => {
    expect(
      isRetryableGmailError({ code: 403, errors: [{ reason: "rateLimitExceeded" }] }),
    ).toBe(true);
    expect(
      isRetryableGmailError({ code: 403, message: "User-rate limit exceeded" }),
    ).toBe(true);
    expect(isRetryableGmailError({ code: 403, message: "forbidden" })).toBe(false);
  });

  it("4xx comunes NO se reintentan", () => {
    expect(isRetryableGmailError({ code: 404 })).toBe(false);
    expect(isRetryableGmailError({ code: 400 })).toBe(false);
    expect(isRetryableGmailError({ code: 401 })).toBe(false);
  });
});

describe("retryAfterMs", () => {
  it("lee Retry-After en segundos", () => {
    expect(
      retryAfterMs({ response: { headers: { "retry-after": "2" } } }),
    ).toBe(2000);
  });
  it("sin header devuelve null", () => {
    expect(retryAfterMs({ response: { headers: {} } })).toBeNull();
    expect(retryAfterMs({})).toBeNull();
  });
});

describe("runWithGmailQuota", () => {
  it("un 429 simulado reintenta LA LLAMADA y la corrida completa (S11)", async () => {
    let attempts = 0;
    const result = await runWithGmailQuota(
      "acc-1",
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("rate") as Error & { code: number };
          error.code = 429;
          throw error;
        }
        return "ok";
      },
      { baseRetryMs: 5 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("errores no reintentables se propagan al primer intento", async () => {
    let attempts = 0;
    await expect(
      runWithGmailQuota(
        "acc-1",
        async () => {
          attempts += 1;
          const error = new Error("not found") as Error & { code: number };
          error.code = 404;
          throw error;
        },
        { baseRetryMs: 5 },
      ),
    ).rejects.toThrow("not found");
    expect(attempts).toBe(1);
  });

  it("agota intentos y propaga el último error", async () => {
    let attempts = 0;
    await expect(
      runWithGmailQuota(
        "acc-1",
        async () => {
          attempts += 1;
          const error = new Error("rate") as Error & { code: number };
          error.code = 429;
          throw error;
        },
        { baseRetryMs: 2, maxAttempts: 3 },
      ),
    ).rejects.toThrow("rate");
    expect(attempts).toBe(3);
  });
});

describe("wrapGmailClientWithQuota", () => {
  it("las llamadas users.* pasan por el adapter y reintentan", async () => {
    let attempts = 0;
    const fake = {
      users: {
        messages: {
          get: async (args: { id: string }) => {
            attempts += 1;
            if (attempts === 1) {
              const error = new Error("rate") as Error & { code: number };
              error.code = 429;
              throw error;
            }
            return { data: { id: args.id } };
          },
        },
      },
    } as unknown as gmail_v1.Gmail;
    const wrapped = wrapGmailClientWithQuota(fake, "acc-test");
    const res = await wrapped.users.messages.get({ userId: "me", id: "m1" } as never);
    expect((res as { data: { id: string } }).data.id).toBe("m1");
    expect(attempts).toBe(2);
  });
});

describe("parseBatchResponseBodies", () => {
  it("extrae los JSON de cada parte multipart", () => {
    const boundary = "batch_abc";
    const body = [
      `--${boundary}`,
      "Content-Type: application/http",
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"id":"m1","threadId":"t1"}',
      `--${boundary}`,
      "Content-Type: application/http",
      "",
      "HTTP/1.1 404 Not Found",
      "",
      '{"error":{"code":404}}',
      `--${boundary}--`,
    ].join("\r\n");
    const parsed = parseBatchResponseBodies(body, boundary);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ id: "m1" });
    expect(parsed[1]).toMatchObject({ error: { code: 404 } });
  });
});
