/**
 * Token firmado para invitación pública a evaluación psicolaboral.
 * Usa `jose` (ya presente en el repo via NextAuth) para evitar añadir
 * dependencias. El secret se toma de PSYCH_TOKEN_SECRET con fallback a
 * NEXTAUTH_SECRET para simplificar despliegue.
 */

import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

const SECRET_RAW =
  process.env.PSYCH_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;

if (!SECRET_RAW && process.env.NODE_ENV === "production") {
  // En dev tolerante — en prod explícito.
  throw new Error(
    "PSYCH_TOKEN_SECRET o NEXTAUTH_SECRET es requerido en producción",
  );
}

const ISSUER = "opai.psych";
const AUDIENCE = "opai.psych.public";

function getSecretKey(): Uint8Array {
  const raw = SECRET_RAW ?? "dev-only-insecure-secret-do-not-use-in-prod";
  return new TextEncoder().encode(raw);
}

export interface PsychTokenPayload {
  aid: string; // assessmentId
  tid: string; // tenantId
  jti: string; // identificador único para revocación
}

export interface PsychTokenVerified extends PsychTokenPayload {
  exp: number;
  iat: number;
}

export async function signPsychInvitation(
  payload: Omit<PsychTokenPayload, "jti">,
  expiresInHours: number,
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    throw new Error("expiresInHours debe ser > 0");
  }
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);

  const token = await new SignJWT({ aid: payload.aid, tid: payload.tid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());

  return { token, jti, expiresAt };
}

export async function verifyPsychInvitation(
  token: string,
): Promise<PsychTokenVerified> {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const aid = payload.aid;
  const tid = payload.tid;
  const jti = payload.jti;
  if (typeof aid !== "string" || typeof tid !== "string" || typeof jti !== "string") {
    throw new Error("Token con payload inválido");
  }
  return {
    aid,
    tid,
    jti,
    exp: payload.exp ?? 0,
    iat: payload.iat ?? 0,
  };
}
