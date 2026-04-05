import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildGuardGoogleSessionCookie,
  createGuardSession,
} from "@/lib/guard-portal-session";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const portalUrl = `${baseUrl}/portal/guardia`;

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${portalUrl}?error=google_cancelled`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${baseUrl}/api/portal/guardia/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error("[Portal Guardia Google] Token exchange failed:", tokens);
    return NextResponse.redirect(`${portalUrl}?error=google_token_failed`);
  }

  // Get Google user info
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const googleUser = await userRes.json();
  const googleId: string = googleUser.sub;
  const googleEmail: string | undefined = googleUser.email?.toLowerCase();
  const googleName: string = googleUser.name || "";

  if (!googleEmail) {
    return NextResponse.redirect(`${portalUrl}?error=google_no_email`);
  }

  // Find guardia by googleAuthId or googleEmail
  const guardia = await prisma.opsGuardia.findFirst({
    where: {
      OR: [
        { googleAuthId: googleId },
        { googleEmail },
      ],
    },
    include: {
      persona: true,
      currentInstallation: { select: { id: true, name: true } },
    },
  });

  if (!guardia) {
    // Guard not found — redirect to postulacion form with Google data
    // Store Google data in a temporary cookie for the form to pre-fill
    const response = NextResponse.redirect(
      `${baseUrl}/postulacion?google_email=${encodeURIComponent(googleEmail)}&google_name=${encodeURIComponent(googleName)}`,
    );
    response.cookies.set({
      name: "google_pending_registration",
      value: JSON.stringify({ googleId, googleEmail, name: googleName }),
      httpOnly: true,
      maxAge: 60 * 30, // 30 minutes
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return response;
  }

  // Link googleAuthId if not already linked
  if (!guardia.googleAuthId) {
    await prisma.opsGuardia.update({
      where: { id: guardia.id },
      data: { googleAuthId: googleId, googleEmail },
    });
  }

  // Build session and redirect
  const session = createGuardSession(guardia, guardia.persona);

  // Audit log
  try {
    await prisma.portalAccessLog.create({
      data: {
        tenantId: guardia.persona.tenantId,
        portalType: "guardia",
        userType: "guardia",
        userId: guardia.id,
        installationId: guardia.currentInstallationId ?? undefined,
        action: "login_google",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });
  } catch {}

  const response = NextResponse.redirect(portalUrl);
  // Set a temporary cookie with the session data — the client will read it,
  // store in localStorage, and clear the cookie
  response.cookies.set(buildGuardGoogleSessionCookie(session));
  return response;
}
