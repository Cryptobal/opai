interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Limpiar entradas expiradas cada 5 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

interface RateLimitOptions {
  /** Máximo de requests permitidos en el window */
  limit: number;
  /** Duración del window en segundos */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { limit: 10, windowSeconds: 60 }
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowSeconds * 1000;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }

  entry.count += 1;

  if (entry.count > options.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: options.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Extrae IP del request para usar como key de rate limit.
 * Funciona en Vercel (x-forwarded-for) y desarrollo local.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}

// ─────────────────────────────────────────────────────────────────────
// Upstash limiters (distribuidos, persistentes entre cold starts).
//
// Usar para endpoints PÚBLICOS donde la ventana debe sobrevivir
// reinicios de la función serverless. El `checkRateLimit` in-memory
// de arriba sirve para casos por-tenant/por-usuario donde la pérdida
// de estado entre cold starts es tolerable.
//
// Requiere UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en env.
// ─────────────────────────────────────────────────────────────────────

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _upstashRedis: Redis | null | undefined;
function getUpstashRedis(): Redis | null {
  if (_upstashRedis !== undefined) return _upstashRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _upstashRedis = null;
    return null;
  }
  _upstashRedis = new Redis({ url, token });
  return _upstashRedis;
}

function makeLimiter(reqs: number, window: `${number} ${"s" | "m" | "h"}`, prefix: string): Ratelimit | null {
  const redis = getUpstashRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(reqs, window),
    analytics: true,
    prefix,
  });
}

let _publicLeadLimiter: Ratelimit | null | undefined;
let _publicMessageLimiter: Ratelimit | null | undefined;

/** 5 leads / IP / hora — null si Upstash no está configurado (caller debe fail-open). */
export function getPublicLeadRateLimit(): Ratelimit | null {
  if (_publicLeadLimiter === undefined) {
    _publicLeadLimiter = makeLimiter(5, "1 h", "ratelimit:public-lead");
  }
  return _publicLeadLimiter;
}

/** 10 mensajes / IP / hora — null si Upstash no está configurado. */
export function getPublicMessageRateLimit(): Ratelimit | null {
  if (_publicMessageLimiter === undefined) {
    _publicMessageLimiter = makeLimiter(10, "1 h", "ratelimit:public-message");
  }
  return _publicMessageLimiter;
}
