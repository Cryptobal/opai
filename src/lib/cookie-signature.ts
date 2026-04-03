/**
 * HMAC-SHA256 cookie signing and verification.
 * Used to prevent forgery of portal session cookies.
 *
 * Format: base64url(payload).base64url(hmac)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret = process.env.PORTAL_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "PORTAL_COOKIE_SECRET must be set and at least 32 characters long",
    );
  }
  return secret;
}

/**
 * Signs a payload string with HMAC-SHA256.
 * Returns: base64url(payload).base64url(hmac)
 */
export function signCookie(payload: string): string {
  const secret = getSecret();
  const payloadB64 = Buffer.from(payload, "utf-8").toString("base64url");
  const hmac = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${hmac}`;
}

/**
 * Verifies a signed cookie and returns the original payload.
 * Returns null if the signature is invalid or missing.
 */
export function verifyCookie(signed: string): string | null {
  if (!signed || !signed.includes(".")) return null;

  const dotIndex = signed.lastIndexOf(".");
  const payloadB64 = signed.slice(0, dotIndex);
  const providedHmac = signed.slice(dotIndex + 1);

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

  // Timing-safe comparison to prevent timing attacks
  const a = Buffer.from(providedHmac, "utf-8");
  const b = Buffer.from(expectedHmac, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return Buffer.from(payloadB64, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}
