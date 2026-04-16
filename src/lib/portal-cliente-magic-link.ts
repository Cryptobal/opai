/**
 * Magic-link autologin para Portal del Cliente.
 *
 * Genera un token firmado (HMAC-SHA256) que identifica un contacto + expiración.
 * El token viaja en la query string (`?k=<token>`) de los correos de
 * seguimiento y del invite inicial para que el cliente entre con un click, sin
 * tener que ingresar el PIN de nuevo.
 *
 * Formato del token: base64url(payload).base64url(hmac)
 *   payload = JSON { c: contactId, e: expEpochSec }
 *
 * Se reutiliza el mismo secreto que la cookie de sesión (`PORTAL_COOKIE_SECRET`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_EXPIRY_DAYS = 30;

function getSecret(): string {
  const secret = process.env.PORTAL_COOKIE_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "PORTAL_COOKIE_SECRET (or AUTH_SECRET) must be set and at least 32 characters long",
    );
  }
  return secret;
}

export function signPortalMagicToken(params: {
  contactId: string;
  expiryDays?: number;
}): string {
  const expSec =
    Math.floor(Date.now() / 1000) +
    (params.expiryDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60;
  const payload = JSON.stringify({ c: params.contactId, e: expSec });
  const payloadB64 = Buffer.from(payload, "utf-8").toString("base64url");
  const hmac = createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${hmac}`;
}

export interface VerifiedMagicToken {
  contactId: string;
  expEpochSec: number;
}

export function verifyPortalMagicToken(token: string | null | undefined): VerifiedMagicToken | null {
  if (!token || !token.includes(".")) return null;
  const dotIndex = token.lastIndexOf(".");
  const payloadB64 = token.slice(0, dotIndex);
  const providedHmac = token.slice(dotIndex + 1);
  if (!payloadB64 || !providedHmac) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const expectedHmac = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  const a = Buffer.from(providedHmac, "utf-8");
  const b = Buffer.from(expectedHmac, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { c?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!parsed.c || typeof parsed.c !== "string") return null;
  if (!parsed.e || typeof parsed.e !== "number") return null;
  if (parsed.e < Math.floor(Date.now() / 1000)) return null;

  return { contactId: parsed.c, expEpochSec: parsed.e };
}

/**
 * Construye la URL de autologin. El link apunta al endpoint GET que valida el
 * token, setea la cookie de sesión y redirige al Portal del Cliente. El `email`
 * y `t` (slug del tenant) viajan como hint para el fallback de login en caso
 * de que el token haya expirado cuando el cliente abre el correo.
 *
 * @param opts.redirectPath Path interno al que redirigir tras el login (ej. "/portal/cliente?section=cotizaciones").
 */
export function buildPortalClienteMagicLinkUrl(opts: {
  baseSiteUrl: string;
  email?: string | null;
  tenantSlug?: string | null;
  contactId: string;
  expiryDays?: number;
  redirectPath?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set("k", signPortalMagicToken({ contactId: opts.contactId, expiryDays: opts.expiryDays }));
  if (opts.email?.trim()) qs.set("email", opts.email.trim());
  if (opts.tenantSlug) qs.set("t", opts.tenantSlug);
  if (opts.redirectPath) qs.set("redirect", opts.redirectPath);
  const base = `${opts.baseSiteUrl.replace(/\/$/, "")}/api/portal/cliente/auth/magic`;
  return `${base}?${qs.toString()}`;
}
