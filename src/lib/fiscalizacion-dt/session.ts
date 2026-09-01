/**
 * Sesión del portal de fiscalización DT — cookie `dt_session` independiente de NextAuth.
 * JWT HS256 con AUTH_SECRET; `exp` = expiración de la clave (Art. 23 c).
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isDtCodeExpired } from "@/lib/fiscalizacion-dt/codes";

export const DT_SESSION_COOKIE = "dt_session";

export interface DtSession {
  email: string;
  codeId: string;
  tenantId: string | null;
  tenantRut: string | null;
  expiresAt: Date;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function signDtSession(session: DtSession): Promise<string> {
  const expSec = Math.max(1, Math.floor(session.expiresAt.getTime() / 1000));
  return new SignJWT({
    typ: "dt_session",
    email: session.email,
    codeId: session.codeId,
    tenantId: session.tenantId,
    tenantRut: session.tenantRut,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expSec)
    .sign(getSecret());
}

export async function verifyDtSessionToken(token: string | undefined | null): Promise<DtSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.typ !== "dt_session") return null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const codeId = typeof payload.codeId === "string" ? payload.codeId : null;
    if (!email || !codeId) return null;
    const expMs = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    return {
      email,
      codeId,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
      tenantRut: typeof payload.tenantRut === "string" ? payload.tenantRut : null,
      expiresAt: new Date(expMs),
    };
  } catch {
    return null;
  }
}

export function dtSessionCookieOptions(expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return {
    httpOnly: true as const,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setDtSessionCookie(session: DtSession): Promise<void> {
  const token = await signDtSession(session);
  const store = await cookies();
  store.set(DT_SESSION_COOKIE, token, dtSessionCookieOptions(session.expiresAt));
}

export async function clearDtSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(DT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Valida JWT + vigencia de la clave en BD. Si la clave expiró, limpia la cookie.
 */
export async function requireDtSession(): Promise<DtSession | null> {
  const store = await cookies();
  const token = store.get(DT_SESSION_COOKIE)?.value;
  const session = await verifyDtSessionToken(token);
  if (!session) return null;

  const code = await prisma.dtFiscalizacionAccessCode.findUnique({
    where: { id: session.codeId },
    select: { id: true, email: true, expiresAt: true },
  });
  if (!code || code.email !== session.email || isDtCodeExpired(code.expiresAt)) {
    await clearDtSessionCookie();
    return null;
  }

  return {
    ...session,
    expiresAt: code.expiresAt,
  };
}

export async function requireDtTenantSession(): Promise<(DtSession & { tenantId: string }) | null> {
  const session = await requireDtSession();
  if (!session?.tenantId) return null;
  return session as DtSession & { tenantId: string };
}
