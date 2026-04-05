import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.ATS_PORTAL_JWT_SECRET || process.env.NEXTAUTH_SECRET || "ats-portal-secret-change-me",
);

export interface AtsPortalToken {
  guardiaId: string;
  tenantId: string;
  personaId: string;
}

export async function createAtsToken(payload: AtsPortalToken): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyAtsToken(token: string): Promise<AtsPortalToken | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      guardiaId: payload.guardiaId as string,
      tenantId: payload.tenantId as string,
      personaId: payload.personaId as string,
    };
  } catch {
    return null;
  }
}
