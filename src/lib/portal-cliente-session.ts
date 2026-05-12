/**
 * Portal Cliente — Session cookie helpers.
 * Extracted from src/app/api/portal/cliente/auth/route.ts for reuse in Google OAuth callback.
 */

import { signCookie } from "@/lib/cookie-signature";
import type { ClienteSession } from "@/lib/portal-cliente-types";

export const PORTAL_CLIENTE_SESSION_COOKIE = "portal_cliente_session";
/**
 * Storage key del backup en localStorage para el token de sesión.
 * Se usa SOLO en el cliente del portal-cliente (PWA iOS pierde cookies al
 * cerrar la app en standalone mode; localStorage sí se persiste).
 */
export const PORTAL_CLIENTE_TOKEN_STORAGE_KEY = "portal_cliente_session_token";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 días

/**
 * Devuelve el valor firmado (HMAC) del token de sesión — es el mismo string
 * que se guarda en la cookie, pero expuesto para guardarlo también en
 * localStorage como backup contra el purge de cookies en iOS PWA.
 */
export function buildClienteSessionToken(session: ClienteSession): string {
  const json = JSON.stringify(session);
  try {
    return signCookie(json);
  } catch {
    // Fallback to unsigned if PORTAL_COOKIE_SECRET not configured yet
    return Buffer.from(json, "utf-8").toString("base64url");
  }
}

export function buildClienteSessionCookie(session: ClienteSession) {
  const value = buildClienteSessionToken(session);
  // iOS Safari (WebKit) en modo PWA "Add to Home Screen" trata las cookies
  // como cookies de sesión y las purga al cerrar la app si NO viene un
  // `Expires` explícito, aunque `Max-Age` esté seteado. Por eso emitimos
  // ambos: maxAge para navegadores modernos y expires para iOS PWA.
  // Ver: bug histórico WebKit con cookies persistentes en standalone mode.
  return {
    name: PORTAL_CLIENTE_SESSION_COOKIE,
    value,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

export function clearClienteSessionCookie() {
  return {
    name: PORTAL_CLIENTE_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}
