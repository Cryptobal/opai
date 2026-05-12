import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateClienteSession, parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import type { ClienteSession, PortalConfig } from "@/lib/portal-cliente-types";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import {
  buildClienteSessionCookie,
  buildClienteSessionToken,
  clearClienteSessionCookie,
} from "@/lib/portal-cliente-session";

// Aliases for backward compatibility within this file
const setSessionCookie = buildClienteSessionCookie;
const clearPortalClienteSessionCookie = clearClienteSessionCookie;
const PORTAL_CLIENTE_SESSION_COOKIE = "portal_cliente_session";

/**
 * Extrae el token de sesión de:
 *   1. Cookie httpOnly `portal_cliente_session` (camino normal)
 *   2. Header `Authorization: Bearer <token>` (fallback para iOS PWA
 *      cuando WebKit purga la cookie al cerrar la app — el cliente
 *      mantiene un backup en localStorage y lo manda en este header).
 */
function readSessionToken(request: NextRequest | undefined, cookieValue: string | undefined): string | undefined {
  if (cookieValue) return cookieValue;
  const authHeader = request?.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    return token || undefined;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(PORTAL_CLIENTE_SESSION_COOKIE)?.value;
  const tokenValue = readSessionToken(request, cookieValue);
  const session = parsePortalClienteSessionCookie(tokenValue);
  if (!session) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  // Si la sesión vino por Bearer (cookie purgada por iOS PWA), forzamos
  // refresh para volver a setear la cookie en el cliente.
  const recoveredFromHeader = !cookieValue && !!tokenValue;

  let needsCookieRefresh = false;
  const freshSession = { ...session };
  if (!Array.isArray(freshSession.installations)) {
    freshSession.installations = [];
    needsCookieRefresh = true;
  }

  try {
    const contact = await prisma.crmContact.findUnique({
      where: { id: session.contactId },
      select: {
        portalEnabled: true,
        email: true,
        account: {
          select: {
            status: true,
            isActive: true,
            portalConfig: true,
            installations: {
              where: { status: { in: ["active", "prospect"] } },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            },
          },
        },
        companyPresentations: {
          where: { status: { in: ['sent', 'viewed'] } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!contact || !contact.portalEnabled) {
      const res = NextResponse.json({ success: false }, { status: 401 });
      res.cookies.set(clearPortalClienteSessionCookie());
      return res;
    }

    const acct = contact.account;
    const accountStillAllowed =
      acct.status === "client_active" ||
      acct.status === "prospect" ||
      (acct.isActive && acct.status !== "client_inactive");
    if (!accountStillAllowed) {
      const res = NextResponse.json({ success: false }, { status: 401 });
      res.cookies.set(clearPortalClienteSessionCookie());
      return res;
    }

    const freshInstallations = acct.installations;
    if (JSON.stringify(freshInstallations) !== JSON.stringify(freshSession.installations)) {
      freshSession.installations = freshInstallations;
      needsCookieRefresh = true;
    }

    const freshIsProspect = acct.status === 'prospect';
    const freshHasPresentation = (contact.companyPresentations?.length ?? 0) > 0;

    if (freshIsProspect !== session.isProspect) {
      freshSession.isProspect = freshIsProspect;
      needsCookieRefresh = true;
    }
    if (freshHasPresentation !== (session.hasActivePresentation ?? false)) {
      freshSession.hasActivePresentation = freshHasPresentation;
      needsCookieRefresh = true;
    }

    // Refrescar portalConfig desde BD para que cambios del admin se reflejen de inmediato
    try {
      const rawConfig = acct.portalConfig;
      const freshConfig: PortalConfig =
        rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
          ? { ...DEFAULT_PORTAL_CONFIG, ...(rawConfig as Partial<PortalConfig>) }
          : DEFAULT_PORTAL_CONFIG;
      const currentConfig = session.portalConfig ?? DEFAULT_PORTAL_CONFIG;
      if (JSON.stringify(freshConfig) !== JSON.stringify(currentConfig)) {
        freshSession.portalConfig = freshConfig;
        needsCookieRefresh = true;
      }
    } catch {
      // portalConfig column may not exist yet
    }

    try {
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
      let freshUrl: string | null = null;

      if (contact.email) {
        const byEmail = await prisma.presentation.findFirst({
          where: {
            recipientEmail: { equals: contact.email, mode: 'insensitive' },
            status: { in: ['sent', 'viewed'] },
            tenantId: session.tenantId,
          },
          select: { uniqueId: true },
          orderBy: { createdAt: 'desc' },
        });
        if (byEmail) freshUrl = `${siteUrl}/p/${byEmail.uniqueId}?mode=commercial`;
      }

      if (!freshUrl && session.accountId) {
        const accountQuote = await prisma.cpqQuote.findFirst({
          where: {
            accountId: session.accountId,
            tenantId: session.tenantId,
            ...cpqQuoteListedInClientPortalWhere(),
          },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });
        if (accountQuote) {
          const byQuote = await prisma.presentation.findFirst({
            where: { quoteId: accountQuote.id, status: { in: ['sent', 'viewed'] } },
            select: { uniqueId: true },
            orderBy: { createdAt: 'desc' },
          });
          if (byQuote) freshUrl = `${siteUrl}/p/${byQuote.uniqueId}?mode=commercial`;
        }
      }

      if (freshUrl !== (session.commercialPresentationUrl ?? null)) {
        freshSession.commercialPresentationUrl = freshUrl;
        needsCookieRefresh = true;
      }
    } catch {}
  } catch {
    // companyPresentations table may not exist in prod yet
  }

  // Si el contenido cambió, refrescamos cookie + token.
  // Si la sesión vino por Bearer (cookie purgada en iOS PWA), también
  // reescribimos la cookie para restaurarla en el navegador.
  const mustWriteCookie = needsCookieRefresh || recoveredFromHeader;
  const freshToken = mustWriteCookie
    ? buildClienteSessionToken(freshSession)
    : tokenValue!;
  const res = NextResponse.json({
    success: true,
    data: freshSession,
    token: freshToken,
  });
  if (mustWriteCookie) {
    res.cookies.set(setSessionCookie(freshSession));
  }
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, pin } = body as { email?: string; pin?: string };

    if (!email?.trim() || !pin) {
      return NextResponse.json({ success: false, error: "Email y PIN son requeridos" }, { status: 400 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const emailNorm = email.trim().toLowerCase();

    // Contacto para lockout
    let contact: { id: string; portalLoginAttempts?: number; portalLockedUntil?: Date | null } | null = null;
    try {
      contact = await prisma.crmContact.findFirst({
        where: {
          portalEnabled: true,
          email: { equals: emailNorm, mode: "insensitive" },
        },
        select: { id: true },
      }) as { id: string } | null;
    } catch (e) {
      console.warn("[Portal Cliente] Lockout lookup skipped:", (e as Error)?.message);
    }

    // Autenticación
    const result = await validateClienteSession(emailNorm, pin, ip);

    if (!result.success || !result.session) {
      if (contact?.id) {
        try {
          const c = await prisma.crmContact.findUnique({
            where: { id: contact.id },
            select: { portalLoginAttempts: true, portalLockedUntil: true },
          });
          if (c) {
            const newAttempts = (c.portalLoginAttempts ?? 0) + 1;
            const updateData: Record<string, unknown> = { portalLoginAttempts: newAttempts };
            if (newAttempts >= 5) {
              updateData.portalLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
              updateData.portalLoginAttempts = 0;
            }
            await prisma.crmContact.update({ where: { id: contact.id }, data: updateData });
          }
        } catch {
          // Columnas de lockout pueden no existir
        }
      }
      return NextResponse.json(
        { success: false, error: result.error ?? "Credenciales inválidas" },
        { status: 401 },
      );
    }

    if (contact?.id) {
      try {
        await prisma.crmContact.update({
          where: { id: contact.id },
          data: { portalLoginAttempts: 0, portalLockedUntil: null },
        });
      } catch {
        // Columnas de lockout pueden no existir
      }
    }

    try {
      await prisma.portalClienteAuditLog.create({
        data: {
          tenantId: result.session.tenantId,
          contactId: result.session.contactId,
          action: "login",
          ip,
        },
      });
    } catch (e) {
      console.warn("[Portal Cliente] Audit log skipped:", (e as Error)?.message);
    }

    try {
      await prisma.portalAccessLog.create({
        data: {
          tenantId: result.session.tenantId,
          portalType: "cliente",
          userType: "contact",
          userId: result.session.contactId,
          accountId: result.session.accountId,
          action: "login",
          ip,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      });
    } catch {}

    const cookie = setSessionCookie(result.session);
    const res = NextResponse.json({
      success: true,
      data: result.session,
      token: cookie.value, // backup para localStorage (iOS PWA cookie purge fix)
    });
    res.cookies.set(cookie);
    return res;
  } catch (error) {
    console.error("[Portal Cliente] Auth error:", error);
    return NextResponse.json({ success: false, error: "Error al autenticar" }, { status: 500 });
  }
}
