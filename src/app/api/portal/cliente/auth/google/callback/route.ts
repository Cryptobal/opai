import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildClienteSessionCookie } from "@/lib/portal-cliente-session";
import { DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import type { ClienteSession, PortalConfig } from "@/lib/portal-cliente-types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const portalUrl = `${baseUrl}/portal/cliente`;

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
      redirect_uri: `${baseUrl}/api/portal/cliente/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error("[Portal Cliente Google] Token exchange failed:", tokens);
    return NextResponse.redirect(`${portalUrl}?error=google_token_failed`);
  }

  // Get Google user info
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const googleUser = await userRes.json();
  const googleEmail = googleUser.email?.toLowerCase();
  const googleId = googleUser.sub;

  if (!googleEmail) {
    return NextResponse.redirect(`${portalUrl}?error=google_no_email`);
  }

  // Find contact by googleId or email
  const contact = await prisma.crmContact.findFirst({
    where: {
      portalEnabled: true,
      OR: [
        { googleId },
        { email: { equals: googleEmail, mode: "insensitive" } },
      ],
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
  });

  if (!contact) {
    return NextResponse.redirect(`${portalUrl}?error=google_not_registered`);
  }

  // Verify account is active
  const acct = contact.account;
  const isActive =
    acct.status === "client_active" ||
    acct.status === "prospect" ||
    (acct.isActive && acct.status !== "client_inactive");
  if (!isActive) {
    return NextResponse.redirect(`${portalUrl}?error=google_account_inactive`);
  }

  // Link googleId if not yet linked
  if (!contact.googleId) {
    await prisma.crmContact.update({
      where: { id: contact.id },
      data: { googleId },
    });
  }

  // Build portal config
  let portalConfig: PortalConfig = DEFAULT_PORTAL_CONFIG;
  if (acct.portalConfig && typeof acct.portalConfig === "object" && !Array.isArray(acct.portalConfig)) {
    portalConfig = { ...DEFAULT_PORTAL_CONFIG, ...(acct.portalConfig as Partial<PortalConfig>) };
  }

  // Resolve account logo
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

  // Resolve ejecutivo
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

  // Update last access
  try {
    await prisma.crmContact.update({
      where: { id: contact.id },
      data: {
        portalLastAccessAt: new Date(),
        portalLastAccessIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    });
  } catch {
    // Columns may not exist
  }

  // Audit log
  try {
    await prisma.portalAccessLog.create({
      data: {
        tenantId: contact.tenantId,
        portalType: "cliente",
        userType: "contact",
        userId: contact.id,
        accountId: contact.accountId,
        action: "login_google",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });
  } catch {}

  const response = NextResponse.redirect(portalUrl);
  response.cookies.set(buildClienteSessionCookie(session));
  return response;
}
