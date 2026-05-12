/**
 * Portal Cliente — Session cookie helpers.
 * Extracted from src/app/api/portal/cliente/auth/route.ts for reuse in Google OAuth callback.
 */

import { signCookie } from "@/lib/cookie-signature";
import type { ClienteSession } from "@/lib/portal-cliente-types";

const PORTAL_CLIENTE_SESSION_COOKIE = "portal_cliente_session";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 días

export function buildClienteSessionCookie(session: ClienteSession) {
  const json = JSON.stringify(session);
  let value: string;
  try {
    value = signCookie(json);
  } catch {
    // Fallback to unsigned if PORTAL_COOKIE_SECRET not configured yet
    value = Buffer.from(json, "utf-8").toString("base64url");
  }
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
