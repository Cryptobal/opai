/**
 * Jooble Job Search API Client
 *
 * Busca ofertas de empleo externas via Jooble API.
 *   - Endpoint: POST https://jooble.org/api/{API_KEY}
 *   - Rate limit: max 1 req/s (enforced client-side)
 *   - Cache en memoria: 15 min TTL
 *
 * Docs: https://jooble.org/api/about
 */

import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────

export type JoobleSearchParams = {
  keywords: string;
  location?: string;
  radius?: "0" | "4" | "8" | "16" | "26" | "40" | "80";
  salary?: number;
  page?: number;
  ResultOnPage?: number;
  SearchMode?: number;
};

export type JoobleJob = {
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
};

export type JoobleResponse = {
  totalCount: number;
  jobs: JoobleJob[];
};

/** Formato normalizado para consumo interno */
export type ExternalJob = {
  externalId: string;
  source: "JOOBLE";
  title: string;
  company: string | null;
  location: string;
  description: string;
  salary: string | null;
  url: string;
  type: string | null;
  postedAt: Date;
  fetchedAt: Date;
};

// ─── Config ─────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) throw new Error("JOOBLE_API_KEY no configurada");
  return key;
}

// ─── Rate Limiter (1 req/s) ─────────────────────────────────────────

let lastRequestAt = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastRequestAt = Date.now();
}

// ─── Cache (15 min TTL) ─────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000;

type CacheEntry = {
  data: JoobleResponse;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function getCacheKey(params: JoobleSearchParams): string {
  return JSON.stringify(params);
}

function getFromCache(key: string): JoobleResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: JoobleResponse): void {
  // Evict expired entries periodically
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Core fetch ─────────────────────────────────────────────────────

async function joobleRequest(
  params: JoobleSearchParams,
  retries = 1,
): Promise<JoobleResponse> {
  const url = `https://jooble.org/api/${getApiKey()}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await enforceRateLimit();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      console.log("[Jooble] request", {
        keywords: params.keywords,
        location: params.location,
        page: params.page,
        attempt,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 403) {
        throw new Error("Jooble API key inválida (403)");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Jooble API error ${res.status}: ${text}`);
      }

      return (await res.json()) as JoobleResponse;
    } catch (err) {
      const isTimeout =
        err instanceof DOMException && err.name === "AbortError";
      const isRetryable = isTimeout || (err instanceof Error && err.message.includes("fetch"));

      if (isRetryable && attempt < retries) {
        console.warn(`[Jooble] retry ${attempt + 1}/${retries}`, err);
        continue;
      }
      throw err;
    }
  }

  throw new Error("[Jooble] todos los intentos fallaron");
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Busca trabajos en Jooble. Retorna respuesta raw con cache.
 */
export async function searchJoobleJobs(
  params: JoobleSearchParams,
): Promise<JoobleResponse> {
  const cacheKey = getCacheKey(params);
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log("[Jooble] cache hit", { keywords: params.keywords });
    return cached;
  }

  const data = await joobleRequest(params);
  setCache(cacheKey, data);
  return data;
}

/**
 * Genera un ID determinístico a partir del link del job.
 */
function generateExternalId(link: string): string {
  return crypto.createHash("sha256").update(link).digest("hex").slice(0, 16);
}

/**
 * Busca y normaliza jobs de Jooble al formato ExternalJob.
 */
export async function searchExternalJobs(
  params: JoobleSearchParams,
): Promise<{ totalCount: number; jobs: ExternalJob[] }> {
  const raw = await searchJoobleJobs(params);
  const now = new Date();

  const jobs: ExternalJob[] = raw.jobs.map((j) => ({
    externalId: generateExternalId(j.link),
    source: "JOOBLE" as const,
    title: j.title,
    company: j.company || null,
    location: j.location,
    description: j.snippet,
    salary: j.salary || null,
    url: j.link,
    type: j.type || null,
    postedAt: new Date(j.updated),
    fetchedAt: now,
  }));

  return { totalCount: raw.totalCount, jobs };
}
