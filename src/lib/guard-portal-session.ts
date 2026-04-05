/**
 * Guard Portal — Session helpers for server-side operations.
 * The guard portal stores sessions in localStorage on the client, but for
 * Google OAuth callbacks we need a way to pass session data via redirect.
 * We use a temporary cookie that the client reads and then clears.
 */

import { signCookie } from "@/lib/cookie-signature";
import type { GuardSession } from "@/lib/guard-portal";

const GUARD_GOOGLE_SESSION_COOKIE = "guard_google_session";
const SESSION_TTL_SECONDS = 60 * 5; // 5 minutes — just for the redirect handoff

/**
 * Build a temporary cookie to pass guard session data to the client after Google OAuth.
 * The client will read this, store in localStorage, and delete the cookie.
 */
export function buildGuardGoogleSessionCookie(session: GuardSession) {
  const json = JSON.stringify(session);
  let value: string;
  try {
    value = signCookie(json);
  } catch {
    value = Buffer.from(json, "utf-8").toString("base64url");
  }
  return {
    name: GUARD_GOOGLE_SESSION_COOKIE,
    value,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: false, // Client needs to read this
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

export function clearGuardGoogleSessionCookie() {
  return {
    name: GUARD_GOOGLE_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

/**
 * Build a GuardSession object from guardia + persona data.
 * Reusable from both PIN auth and Google OAuth callback.
 */
export function createGuardSession(
  guardia: {
    id: string;
    code: string | null;
    currentInstallationId: string | null;
    currentInstallation?: { id: string; name: string } | null;
    faceIdRegistered?: boolean;
    lifecycleStatus: string;
  },
  persona: {
    id: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    rut: string | null;
  },
): GuardSession {
  return {
    guardiaId: guardia.id,
    personaId: persona.id,
    tenantId: persona.tenantId,
    firstName: persona.firstName,
    lastName: persona.lastName,
    rut: persona.rut ?? "",
    code: guardia.code,
    currentInstallationId: guardia.currentInstallationId,
    currentInstallationName: guardia.currentInstallation?.name ?? null,
    authenticatedAt: new Date().toISOString(),
    faceIdRegistered: guardia.faceIdRegistered ?? false,
    lifecycleStatus: guardia.lifecycleStatus,
    isPostulante: ["postulante", "inactivo"].includes(guardia.lifecycleStatus),
  };
}
