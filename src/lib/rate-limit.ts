import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function makeUpstashLimiter(prefix: string, count: number): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(count, "1 h"),
    analytics: true,
    prefix,
  });
}

/**
 * Rate limit para endpoint público de creación de leads.
 * 5 leads / IP / hora. null si UPSTASH no está configurado (caller debe fail-open).
 */
export const publicLeadRateLimit = makeUpstashLimiter("ratelimit:public-lead", 5);

/**
 * Rate limit para endpoint público de mensajes/contacto.
 * 10 mensajes / IP / hora. null si UPSTASH no está configurado (caller debe fail-open).
 */
export const publicMessageRateLimit = makeUpstashLimiter("ratelimit:public-message", 10);

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
