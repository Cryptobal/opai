import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildGuardGoogleSessionCookie,
  createGuardSession,
} from "@/lib/guard-portal-session";
import { buildClienteSessionCookie } from "@/lib/portal-cliente-session";
import { DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import type { ClienteSession, PortalConfig } from "@/lib/portal-cliente-types";

/**
 * Unified Google OAuth callback for the personal (Opai) app.
 *
 * Resolves the Google email into one of three roles:
 *   - guardia  → reuse createGuardSession + guard_google_session cookie
 *   - admin    → NextAuth Google sign-in for ERP (redirect to /api/auth/signin/google → /hub)
 *   - cliente  → reuse buildClienteSessionCookie
 *
 * Resolution:
 *   0 matches → redirect to /postulacion with Google hint
 *   1 match   → create the session and redirect (admin → ERP /hub; otherwise the portal)
 *   2+ matches → redirect to hub with ?roles= query so the user can pick
 */
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function GET(request: NextRequest) {
  const baseUrl =
    process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const hubUrl = `${baseUrl}/portal/personas`;

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${hubUrl}?error=google_cancelled`);
  }

  // 1. Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${baseUrl}/api/portal/auth/unified-google/callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error("[Unified Google] Token exchange failed:", tokens);
    return NextResponse.redirect(`${hubUrl}?error=google_token_failed`);
  }

  // 2. Fetch Google user info
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const googleUser = await userRes.json();
  const googleId: string = googleUser.sub;
  const googleEmail: string | undefined = googleUser.email?.toLowerCase();
  const googleName: string = googleUser.name || "";

  if (!googleEmail) {
    return NextResponse.redirect(`${hubUrl}?error=google_no_email`);
  }

  // 3. Search the three tables in parallel
  const [guardiaResult, adminResult, contactResult] = await Promise.allSettled([
    prisma.opsGuardia.findFirst({
      where: {
        OR: [
          { googleAuthId: googleId },
          { googleEmail: { equals: googleEmail, mode: "insensitive" } },
          {
            persona: {
              email: { equals: googleEmail, mode: "insensitive" },
            },
          },
        ],
      },
      include: {
        persona: true,
        currentInstallation: { select: { id: true, name: true } },
      },
    }),
    prisma.admin.findFirst({
      where: {
        OR: [
          { googleId },
          { email: { equals: googleEmail, mode: "insensitive" } },
        ],
        status: "active",
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        googleId: true,
      },
    }),
    prisma.crmContact.findFirst({
      where: {
        portalEnabled: true,
        OR: [
          { googleId },
          { email: { equals: googleEmail, mode: "insensitive" } },
        ],
        account: { isActive: true },
      },
      select: {
        id: true,
        tenantId: true,
        accountId: true,
        firstName: true,
        lastName: true,
        email: true,
        googleId: true,
        account: {
          select: {
            name: true,
            status: true,
            isActive: true,
            rut: true,
            logoUrl: true,
            notes: true,
            portalConfig: true,
            portalTourShown: true,
            portalEjecutivoId: true,
            installations: {
              where: { status: { in: ["active", "prospect"] } },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    }),
  ]);

  const guardia =
    guardiaResult.status === "fulfilled" ? guardiaResult.value : null;
  const admin =
    adminResult.status === "fulfilled" ? adminResult.value : null;
  const contact =
    contactResult.status === "fulfilled" ? contactResult.value : null;

  // 4. Count matches
  const matchTypes: Array<"guardia" | "admin" | "cliente"> = [];
  if (guardia) matchTypes.push("guardia");
  if (admin) matchTypes.push("admin");
  if (contact) matchTypes.push("cliente");

  // 5a. No match → ATS postulation
  if (matchTypes.length === 0) {
    const response = NextResponse.redirect(
      `${baseUrl}/postulacion?google_email=${encodeURIComponent(googleEmail)}&google_name=${encodeURIComponent(googleName)}`,
    );
    response.cookies.set({
      name: "google_pending_registration",
      value: JSON.stringify({ googleId, googleEmail, name: googleName }),
      httpOnly: true,
      maxAge: 60 * 30,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return response;
  }

  // 5b. Multiple matches → hub with role selector
  if (matchTypes.length > 1) {
    const params = new URLSearchParams({
      roles: matchTypes.join(","),
      email: googleEmail,
    });
    return NextResponse.redirect(`${hubUrl}?${params}`);
  }

  // 5c. Exactly one match → sign in and redirect
  const role = matchTypes[0];

  if (role === "guardia" && guardia) {
    // Link googleAuthId if missing
    if (!guardia.googleAuthId) {
      await prisma.opsGuardia.update({
        where: { id: guardia.id },
        data: { googleAuthId: googleId, googleEmail },
      });
    }

    const session = createGuardSession(guardia, guardia.persona);

    try {
      await prisma.portalAccessLog.create({
        data: {
          tenantId: guardia.persona.tenantId,
          portalType: "guardia",
          userType: "guardia",
          userId: guardia.id,
          installationId: guardia.currentInstallationId ?? undefined,
          action: "login_google",
          ip:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      });
    } catch {
      /* non-fatal */
    }

    const response = NextResponse.redirect(`${baseUrl}/portal/guardia`);
    response.cookies.set(buildGuardGoogleSessionCookie(session));
    return response;
  }

  if (role === "admin" && admin) {
    // Link googleId if missing — NextAuth will also do this on signIn, but
    // setting it proactively ensures the next sign-in matches by id.
    if (!admin.googleId) {
      try {
        await prisma.admin.update({
          where: { id: admin.id },
          data: { googleId },
        });
      } catch {
        /* non-fatal */
      }
    }

    // Hand off to NextAuth's Google provider so it creates the ERP session
    // cookie and lands the user on /hub. With `prompt=select_account` the UX
    // is smooth even when the user is already signed in to Google.
    const callbackUrl = encodeURIComponent(`${baseUrl}/hub`);
    return NextResponse.redirect(
      `${baseUrl}/api/auth/signin/google?callbackUrl=${callbackUrl}`,
    );
  }

  if (role === "cliente" && contact) {
    // Link googleId if missing
    if (!contact.googleId) {
      try {
        await prisma.crmContact.update({
          where: { id: contact.id },
          data: { googleId },
        });
      } catch {
        /* non-fatal */
      }
    }

    const acct = contact.account;

    // Build portal config (same logic as cliente google callback)
    let portalConfig: PortalConfig = DEFAULT_PORTAL_CONFIG;
    if (
      acct.portalConfig &&
      typeof acct.portalConfig === "object" &&
      !Array.isArray(acct.portalConfig)
    ) {
      portalConfig = {
        ...DEFAULT_PORTAL_CONFIG,
        ...(acct.portalConfig as Partial<PortalConfig>),
      };
    }

    // Resolve account logo (same logic as cliente google callback)
    const BROKEN_LOGO_PREFIX = "/uploads/company-logos/";
    let accountLogoUrl: string | null = acct.logoUrl ?? null;
    if (accountLogoUrl?.startsWith(BROKEN_LOGO_PREFIX)) accountLogoUrl = null;
    if (!accountLogoUrl && acct.notes) {
      const marker = "[[ACCOUNT_LOGO_URL:";
      const start = acct.notes.indexOf(marker);
      if (start >= 0) {
        const end = acct.notes.indexOf("]]", start);
        if (end >= 0) {
          const url = acct.notes.slice(start + marker.length, end).trim();
          if (url && !url.startsWith(BROKEN_LOGO_PREFIX)) accountLogoUrl = url;
        }
      }
    }

    let ejecutivoName: string | null = null;
    if (acct.portalEjecutivoId) {
      const ejecutivo = await prisma.admin.findUnique({
        where: { id: acct.portalEjecutivoId },
        select: { name: true },
      });
      if (ejecutivo) ejecutivoName = ejecutivo.name;
    }

    const session: ClienteSession = {
      contactId: contact.id,
      tenantId: contact.tenantId,
      accountId: contact.accountId,
      accountName: acct.name,
      accountRut: acct.rut ?? null,
      accountLogoUrl,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      installations: acct.installations,
      authenticatedAt: new Date().toISOString(),
      portalConfig,
      isProspect: acct.status === "prospect",
      hasDemoData: false,
      portalTourShown: acct.portalTourShown ?? false,
      ejecutivoId: acct.portalEjecutivoId ?? null,
      ejecutivoName,
      hasActivePresentation: false,
      commercialPresentationUrl: null,
    };

    try {
      await prisma.portalAccessLog.create({
        data: {
          tenantId: contact.tenantId,
          portalType: "cliente",
          userType: "contact",
          userId: contact.id,
          accountId: contact.accountId,
          action: "login_google",
          ip:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      });
    } catch {
      /* non-fatal */
    }

    const response = NextResponse.redirect(`${baseUrl}/portal/cliente`);
    response.cookies.set(buildClienteSessionCookie(session));
    return response;
  }

  // Shouldn't reach here, but fall back to the hub
  return NextResponse.redirect(`${hubUrl}?error=unexpected`);
}
