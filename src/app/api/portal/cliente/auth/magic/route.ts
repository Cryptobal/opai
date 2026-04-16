/**
 * Magic-link autologin al Portal del Cliente.
 *
 * GET /api/portal/cliente/auth/magic?k=<token>&redirect=<path>
 *
 * Verifica el token HMAC, resuelve la sesión y setea la cookie del portal.
 * Después redirige a `/portal/cliente` (o al path indicado en `redirect`).
 *
 * El token se genera en `buildPortalClienteMagicLinkUrl` y se embebe en los
 * correos de seguimiento y en el invite inicial.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildClienteSessionCookie } from "@/lib/portal-cliente-session";
import { verifyPortalMagicToken } from "@/lib/portal-cliente-magic-link";
import { DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import type { ClienteSession, PortalConfig } from "@/lib/portal-cliente-types";

export async function GET(request: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "";
  const portalHome = `${baseUrl}/portal/cliente`;

  const token = request.nextUrl.searchParams.get("k");
  const redirectPath = request.nextUrl.searchParams.get("redirect") || "";
  const redirectUrl = redirectPath.startsWith("/")
    ? `${baseUrl}${redirectPath}`
    : portalHome;

  const verified = verifyPortalMagicToken(token);
  if (!verified) {
    // Token inválido o expirado: redirige al portal con pista para que el
    // cliente entre con PIN. El email (si viene) se preserva en el query para
    // pre-llenar el campo del login.
    const email = request.nextUrl.searchParams.get("email");
    const t = request.nextUrl.searchParams.get("t");
    const qs = new URLSearchParams();
    if (email) qs.set("email", email);
    if (t) qs.set("t", t);
    qs.set("error", "magic_expired");
    return NextResponse.redirect(`${portalHome}?${qs.toString()}`);
  }

  const contact = await prisma.crmContact.findUnique({
    where: { id: verified.contactId },
    select: {
      id: true,
      tenantId: true,
      accountId: true,
      firstName: true,
      lastName: true,
      email: true,
      portalEnabled: true,
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

  if (!contact || !contact.portalEnabled) {
    return NextResponse.redirect(`${portalHome}?error=magic_not_enabled`);
  }

  const acct = contact.account;
  const isActive =
    acct.status === "client_active" ||
    acct.status === "prospect" ||
    (acct.isActive && acct.status !== "client_inactive");
  if (!isActive) {
    return NextResponse.redirect(`${portalHome}?error=magic_account_inactive`);
  }

  let portalConfig: PortalConfig = DEFAULT_PORTAL_CONFIG;
  if (acct.portalConfig && typeof acct.portalConfig === "object" && !Array.isArray(acct.portalConfig)) {
    portalConfig = { ...DEFAULT_PORTAL_CONFIG, ...(acct.portalConfig as Partial<PortalConfig>) };
  }

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

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  try {
    await prisma.crmContact.update({
      where: { id: contact.id },
      data: {
        portalLastAccessAt: new Date(),
        portalLastAccessIp: ip,
      },
    });
  } catch {}

  try {
    await prisma.portalAccessLog.create({
      data: {
        tenantId: contact.tenantId,
        portalType: "cliente",
        userType: "contact",
        userId: contact.id,
        accountId: contact.accountId,
        action: "login_magic",
        ip,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });
  } catch {}

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(buildClienteSessionCookie(session));
  return response;
}
