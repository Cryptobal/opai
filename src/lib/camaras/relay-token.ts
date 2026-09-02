import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { RelayTokenClaims } from "./types";

const TOKEN_EXP = "10m";

function getJwtSecret(): Uint8Array {
  const secret = process.env.MEDIA_RELAY_JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      "MEDIA_RELAY_JWT_SECRET no está definido. Configura esta variable para firmar tokens del relay.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signRelayToken(input: {
  tenantId: string;
  streams: string[];
  userId: string;
  expiresIn?: string;
}): Promise<string> {
  return new SignJWT({
    tid: input.tenantId,
    s: input.streams,
    uid: input.userId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(input.expiresIn ?? TOKEN_EXP)
    .sign(getJwtSecret());
}

function asClaims(payload: JWTPayload): RelayTokenClaims | null {
  const tid = typeof payload.tid === "string" ? payload.tid : null;
  const uid = typeof payload.uid === "string" ? payload.uid : null;
  const s = Array.isArray(payload.s)
    ? payload.s.filter((v): v is string => typeof v === "string")
    : null;
  if (!tid || !uid || !s) return null;
  return { tid, uid, s };
}

export async function verifyRelayToken(token: string): Promise<RelayTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    return asClaims(payload);
  } catch {
    return null;
  }
}

export function tokenAllowsStream(claims: RelayTokenClaims, src: string): boolean {
  return claims.s.includes(src);
}
