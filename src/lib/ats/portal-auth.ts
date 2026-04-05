import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifyAtsToken, type AtsPortalToken } from "./token.service";

const COOKIE_NAME = "ats-portal-token";

export async function getPortalSession(): Promise<AtsPortalToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAtsToken(token);
}

export async function getPortalSessionFromRequest(req: NextRequest): Promise<AtsPortalToken | null> {
  // Try cookie first
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) {
    const session = await verifyAtsToken(cookieToken);
    if (session) return session;
  }
  // Try Authorization header
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyAtsToken(authHeader.slice(7));
  }
  return null;
}

export function setPortalCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  };
}

export function clearPortalCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}
