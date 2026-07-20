import { createHmac } from "crypto";
import { google } from "googleapis";
import {
  calendarRedirectUri,
  driveRedirectUri,
  googleClientId,
  googleClientSecret,
  tokenSecret,
} from "./env";

export type OAuthState = { tenantId: string; userId: string; ts: number };

function signState(payload: string): string {
  return createHmac("sha256", tokenSecret()).update(payload).digest("hex");
}

export function buildState(input: { tenantId: string; userId: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ ...input, ts: Date.now() } satisfies OAuthState),
  ).toString("base64url");
  return `${payload}.${signState(payload)}`;
}

export function verifyState(state: string): OAuthState | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || signState(payload) !== signature) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as OAuthState;
    if (!decoded.tenantId || !decoded.userId) return null;
    return decoded;
  } catch {
    return null;
  }
}

function makeOAuth2(redirectUri: string | undefined, label: string) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret || !redirectUri) {
    console.warn(
      `[google-workspace] Faltan env OAuth para ${label} (GOOGLE_CLIENT_ID/SECRET o redirect URI)`,
    );
    return null;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getDriveOAuthClient() {
  return makeOAuth2(driveRedirectUri(), "Drive");
}

export function getCalendarOAuthClient() {
  return makeOAuth2(calendarRedirectUri(), "Calendar");
}
