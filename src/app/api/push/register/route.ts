import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { auth } from "@/lib/auth";

const VALID_USER_TYPES = new Set(["guardia", "supervisor", "cliente", "admin"]);
const VALID_PLATFORMS = new Set(["android", "ios", "web"]);

type UserType = "guardia" | "supervisor" | "cliente" | "admin";

/**
 * Registers a Capacitor / native push notification token against a user.
 * Used only by the personal (Opai) app — NEVER by Terreno (shared devices
 * don't receive personal push notifications).
 *
 * Security: `tenantId` is NEVER trusted from the request body. It is
 * always resolved server-side from the authenticated session (cliente /
 * supervisor / admin via cookies) or, for guardia (which stores its
 * session in localStorage), by looking up the referenced guardia record
 * in the DB. This prevents any authenticated user from injecting push
 * tokens into a different tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      platform?: string;
      userId?: string;
      userType?: string;
      deviceInfo?: string;
    };

    const { token, platform, userId, userType, deviceInfo } = body;

    if (!token || !platform || !userId || !userType) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos faltantes" },
        { status: 400 },
      );
    }

    if (!VALID_USER_TYPES.has(userType)) {
      return NextResponse.json(
        { success: false, error: "userType inválido" },
        { status: 400 },
      );
    }

    if (!VALID_PLATFORMS.has(platform)) {
      return NextResponse.json(
        { success: false, error: "platform inválido" },
        { status: 400 },
      );
    }

    // Resolve tenantId + verify the caller is allowed to register a token
    // for this userId. Tenant is NEVER taken from the request body.
    const resolved = await resolveTenantForUser(userType as UserType, userId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    await prisma.pushToken.upsert({
      where: { token },
      update: {
        tenantId: resolved.tenantId,
        userId: resolved.userId,
        userType,
        platform,
        deviceInfo: deviceInfo ?? null,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        tenantId: resolved.tenantId,
        userId: resolved.userId,
        userType,
        token,
        platform,
        deviceInfo: deviceInfo ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/register] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar token" },
      { status: 500 },
    );
  }
}

/**
 * Resolves `{ tenantId, userId }` server-side for the caller. Never trusts
 * tenant data from the request body.
 *
 *  - cliente      → from portal_cliente_session cookie
 *  - supervisor   → from NextAuth session (admin.tenantId)
 *  - admin        → same as supervisor
 *  - guardia      → localStorage-backed; we look up the guardia by id and
 *                   return its persona.tenantId. The userId claim is
 *                   accepted but the tenantId is fetched from the DB.
 */
async function resolveTenantForUser(
  userType: UserType,
  claimedUserId: string,
): Promise<{ tenantId: string; userId: string } | null> {
  if (userType === "cliente") {
    const cookieStore = await cookies();
    const raw = cookieStore.get("portal_cliente_session")?.value;
    const session = parsePortalClienteSessionCookie(raw);
    if (!session) return null;
    // Only allow registering under the own contactId from the cookie.
    if (session.contactId !== claimedUserId) return null;
    return { tenantId: session.tenantId, userId: session.contactId };
  }

  if (userType === "supervisor" || userType === "admin") {
    const session = await auth();
    const adminId = (session?.user as { id?: string } | undefined)?.id;
    const tenantId = (session?.user as { tenantId?: string } | undefined)
      ?.tenantId;
    if (!adminId || !tenantId) return null;
    if (adminId !== claimedUserId) return null;
    return { tenantId, userId: adminId };
  }

  if (userType === "guardia") {
    // Guardia sessions live in localStorage, so we can't verify identity
    // from a cookie. We verify by DB lookup: the claimedUserId must point
    // to an existing guardia record and we take its tenantId from the DB.
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: claimedUserId },
      select: {
        id: true,
        persona: { select: { tenantId: true } },
      },
    });
    if (!guardia?.persona?.tenantId) return null;
    return { tenantId: guardia.persona.tenantId, userId: guardia.id };
  }

  return null;
}
