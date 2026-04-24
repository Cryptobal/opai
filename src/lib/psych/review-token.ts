/**
 * Token firmado para link de revisión del psicólogo externo.
 * Similar a invitation-token.ts pero con audiencia distinta ("psych.review").
 */

import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

const SECRET_RAW =
  process.env.PSYCH_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;

if (!SECRET_RAW && process.env.NODE_ENV === "production") {
  throw new Error("PSYCH_TOKEN_SECRET o NEXTAUTH_SECRET requerido en prod");
}

const ISSUER = "opai.psych";
const AUDIENCE = "opai.psych.review";

function key(): Uint8Array {
  return new TextEncoder().encode(
    SECRET_RAW ?? "dev-only-insecure-secret",
  );
}

export interface PsychReviewTokenPayload {
  aid: string; // assessmentId
  tid: string; // tenantId
  eml: string; // reviewer email (para verificación cruzada)
  jti: string;
}

export async function signPsychReviewToken(
  payload: Omit<PsychReviewTokenPayload, "jti">,
  expiresInHours: number,
): Promise<{ token: string; expiresAt: Date }> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
  const token = await new SignJWT({
    aid: payload.aid,
    tid: payload.tid,
    eml: payload.eml,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key());
  return { token, expiresAt };
}

export async function verifyPsychReviewToken(token: string) {
  const { payload } = await jwtVerify(token, key(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (
    typeof payload.aid !== "string" ||
    typeof payload.tid !== "string" ||
    typeof payload.eml !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Token con payload inválido");
  }
  return {
    aid: payload.aid,
    tid: payload.tid,
    eml: payload.eml,
    jti: payload.jti,
    exp: payload.exp ?? 0,
  };
}
