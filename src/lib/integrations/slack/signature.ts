/**
 * Verificación de firma de peticiones entrantes de Slack.
 *
 * Slack firma cada request con HMAC-SHA256 sobre `v0:{timestamp}:{rawBody}`
 * usando `SLACK_SIGNING_SECRET`. Rechazamos si el timestamp difiere del
 * reloj local por más de 300s (anti-replay) o si la firma no calza.
 * Ver https://api.slack.com/authentication/verifying-requests-from-slack
 */

import { createHmac, timingSafeEqual } from "node:crypto";

interface SignedRequest {
  headers: Headers;
  rawBody: string;
}

const MAX_SKEW_SECONDS = 300;

export function verifySlackSignature({ headers, rawBody }: SignedRequest): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    console.error("[slack] SLACK_SIGNING_SECRET no configurado; rechazando request");
    return false;
  }

  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) {
    console.error("[slack] request con timestamp fuera de ventana (posible replay)");
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", secret).update(base).digest("hex")}`;

  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
