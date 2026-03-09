import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token de autorización requerido" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { guardId } = body;

    if (!guardId) {
      return NextResponse.json(
        { success: false, error: "guardId es requerido" },
        { status: 400 }
      );
    }

    // Try legacy table first
    const legacyDevice = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.findUnique({
          where: { deviceToken: token },
        }),
      null
    );

    if (legacyDevice && legacyDevice.isActive) {
      await safeAccessControlQuery(
        () =>
          prisma.accessControlDevice.update({
            where: { id: legacyDevice.id },
            data: {
              currentGuardId: guardId,
              guardSelectedAt: new Date(),
            },
          }),
        null
      );
      return NextResponse.json({ success: true });
    }

    // Fallback: unified DevicePairing table
    const unifiedDevice = await prisma.devicePairing.findFirst({
      where: { deviceToken: token },
      select: { id: true },
    });

    if (!unifiedDevice) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no válido o desvinculado" },
        { status: 401 }
      );
    }

    await prisma.devicePairing.update({
      where: { id: unifiedDevice.id },
      data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error setting guard:", error);
    return NextResponse.json(
      { success: false, error: "Error al asignar guardia" },
      { status: 500 }
    );
  }
}
