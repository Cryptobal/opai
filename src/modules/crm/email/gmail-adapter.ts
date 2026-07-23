/**
 * GmailAdapter (S11, PR-13): punto único de acceso a la API de Gmail.
 *
 * `gmailClientForAccount` (gmail-account-client.ts) es el ÚNICO constructor de
 * clientes y envuelve cada cliente con este adapter, así el 100% de las
 * llamadas `users.*` — backfill, incremental, detail, actions, attachments,
 * send, drafts, sendAs — pasa por:
 *
 *  1. Rate-limiter token-bucket POR CASILLA (Gmail limita por usuario). El
 *     bucket es in-memory por instancia serverless: acota la corrida actual,
 *     que es donde se concentra el volumen (sync/backfill corren en una sola
 *     instancia); no coordina entre instancias (documentado, suficiente).
 *  2. Reintento de LA LLAMADA (no de la corrida completa) ante 429 /
 *     rateLimitExceeded / 5xx, honrando `Retry-After` si viene, con backoff
 *     exponencial + jitter y tope de intentos.
 */
import type { gmail_v1 } from "googleapis";

/** Llamadas sostenidas por segundo por casilla (Gmail ~250 unidades/s/usuario;
 *  messages.get = 5 unidades → 15 rps deja margen para llamadas caras). */
const RATE_PER_SECOND = 15;
const BURST = 30;
const MAX_ATTEMPTS = 4;
const BASE_RETRY_MS = 500;
const MAX_RETRY_WAIT_MS = 20_000;

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Consume 1 token del bucket de la casilla, esperando si está vacío. */
export async function acquireGmailToken(accountKey: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const bucket = buckets.get(accountKey) ?? { tokens: BURST, updatedAt: now };
    const refilled = Math.min(
      BURST,
      bucket.tokens + ((now - bucket.updatedAt) / 1000) * RATE_PER_SECOND,
    );
    if (refilled >= 1) {
      buckets.set(accountKey, { tokens: refilled - 1, updatedAt: now });
      return;
    }
    buckets.set(accountKey, { tokens: refilled, updatedAt: now });
    await sleep(Math.ceil(((1 - refilled) / RATE_PER_SECOND) * 1000));
  }
}

type GmailApiError = {
  code?: number;
  status?: number;
  message?: string;
  response?: {
    status?: number;
    headers?: Record<string, string | string[] | undefined>;
  };
  errors?: Array<{ reason?: string }>;
};

function errorStatus(error: unknown): number | null {
  const e = error as GmailApiError;
  const status = e?.code ?? e?.status ?? e?.response?.status;
  return typeof status === "number" ? status : null;
}

/** 429, 403 de cuota (rate/quota) y 5xx son transitorios: reintentar la llamada. */
export function isRetryableGmailError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 429) return true;
  if (status !== null && status >= 500) return true;
  if (status === 403) {
    const e = error as GmailApiError;
    const reasons = (e.errors ?? []).map((x) => x.reason ?? "").join(" ");
    // Cubre reasons de la API (rateLimitExceeded/userRateLimitExceeded/
    // quotaExceeded) y mensajes tipo "User-rate limit exceeded".
    return /rate ?-? ?limit|quota/i.test(`${reasons} ${e.message ?? ""}`);
  }
  return false;
}

/** Espera indicada por Retry-After (segundos o fecha), si el error la trae. */
export function retryAfterMs(error: unknown): number | null {
  const headers = (error as GmailApiError)?.response?.headers;
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_WAIT_MS);
  }
  return null;
}

export type GmailQuotaOptions = {
  maxAttempts?: number;
  baseRetryMs?: number;
};

/** Ejecuta una llamada Gmail con token-bucket + retry de la llamada. */
export async function runWithGmailQuota<T>(
  accountKey: string,
  call: () => Promise<T>,
  opts?: GmailQuotaOptions,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? MAX_ATTEMPTS;
  const baseRetryMs = opts?.baseRetryMs ?? BASE_RETRY_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await acquireGmailToken(accountKey);
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableGmailError(error)) throw error;
      const wait =
        retryAfterMs(error) ??
        Math.min(
          baseRetryMs * 3 ** (attempt - 1) * (0.8 + Math.random() * 0.4),
          MAX_RETRY_WAIT_MS,
        );
      await sleep(wait);
    }
  }
  throw lastError;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function deepQuotaProxy(node: any, accountKey: string): any {
  const cache = new Map<PropertyKey, unknown>();
  return new Proxy(node, {
    get(target, prop, receiver) {
      if (cache.has(prop)) return cache.get(prop);
      const value = Reflect.get(target, prop, receiver);
      let wrapped: unknown = value;
      if (typeof value === "function") {
        wrapped = (...args: unknown[]) =>
          runWithGmailQuota(accountKey, () => value.apply(target, args));
      } else if (value && typeof value === "object") {
        wrapped = deepQuotaProxy(value, accountKey);
      }
      cache.set(prop, wrapped);
      return wrapped;
    },
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Envuelve el cliente Gmail: todas las llamadas bajo `users.*` pasan por el
 * token-bucket + retry. El resto del cliente (context/auth) queda intacto.
 */
export function wrapGmailClientWithQuota(
  gmail: gmail_v1.Gmail,
  accountKey: string,
): gmail_v1.Gmail {
  const users = deepQuotaProxy(gmail.users, accountKey);
  return new Proxy(gmail, {
    get(target, prop, receiver) {
      if (prop === "users") return users;
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Solo para tests: resetea el estado de buckets. */
export function __resetGmailQuotaForTests(): void {
  buckets.clear();
}
