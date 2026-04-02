import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateClienteSession, parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import type { ClienteSession, PortalConfig } from "@/lib/portal-cliente-types";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";

const PORTAL_CLIENTE_SESSION_COOKIE = "portal_cliente_session";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 días — sesión persistente del portal cliente

function setSessionCookie(session: ClienteSession) {
  const value = Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
  return {
    name: PORTAL_CLIENTE_SESSION_COOKIE,
    value,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

function clearPortalClienteSessionCookie() {
  return {
    name: PORTAL_CLIENTE_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get(PORTAL_CLIENTE_SESSION_COOKIE)?.value
  );
  if (!session) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

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
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://opai.gard.cl';
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

  if (needsCookieRefresh) {
    const res = NextResponse.json({ success: true, data: freshSession });
    res.cookies.set(setSessionCookie(freshSession));
    return res;
  }

  return NextResponse.json({ success: true, data: freshSession });
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

    const res = NextResponse.json({ success: true, data: result.session });
    res.cookies.set(setSessionCookie(result.session));
    return res;
  } catch (error) {
    console.error("[Portal Cliente] Auth error:", error);
    return NextResponse.json({ success: false, error: "Error al autenticar" }, { status: 500 });
  }
}
