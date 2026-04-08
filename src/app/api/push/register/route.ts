import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_USER_TYPES = new Set(["guardia", "supervisor", "cliente", "admin"]);
const VALID_PLATFORMS = new Set(["android", "ios", "web"]);

/**
 * Registers a Capacitor / native push notification token against a user.
 * Used only by the personal (Opai) app — NEVER by Terreno (shared devices
 * don't receive personal push notifications).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      platform?: string;
      tenantId?: string;
      userId?: string;
      userType?: string;
      deviceInfo?: string;
    };

    const { token, platform, tenantId, userId, userType, deviceInfo } = body;

    if (!token || !platform || !tenantId || !userId || !userType) {
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

    await prisma.pushToken.upsert({
      where: { token },
      update: {
        tenantId,
        userId,
        userType,
        platform,
        deviceInfo: deviceInfo ?? null,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        userId,
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
