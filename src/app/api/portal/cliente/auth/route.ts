import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateClienteSession, parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import type { ClienteSession } from "@/lib/portal-cliente-types";

const PORTAL_CLIENTE_SESSION_COOKIE = "portal_cliente_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 días

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

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get(PORTAL_CLIENTE_SESSION_COOKIE)?.value
  );
  if (!session?.installations?.length)
    return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({ success: true, data: session });
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

    const res = NextResponse.json({ success: true, data: result.session });
    res.cookies.set(setSessionCookie(result.session));
    return res;
  } catch (error) {
    console.error("[Portal Cliente] Auth error:", error);
    return NextResponse.json({ success: false, error: "Error al autenticar" }, { status: 500 });
  }
}
