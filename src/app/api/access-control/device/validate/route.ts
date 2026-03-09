import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token de autorización requerido" },
        { status: 401 }
      );
    }

    // Try legacy table first
    const legacyDevice = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.findUnique({
          where: { deviceToken: token },
          include: {
            installation: {
              select: { name: true, address: true },
            },
          },
        }),
      null
    );

    if (legacyDevice && legacyDevice.isActive) {
      const forwardedFor = request.headers.get("x-forwarded-for");
      const lastIp = forwardedFor?.split(",")[0]?.trim() ?? null;

      await safeAccessControlQuery(
        () =>
          prisma.accessControlDevice.update({
            where: { id: legacyDevice.id },
            data: { lastActivityAt: new Date(), lastIp },
          }),
        null
      );

      return NextResponse.json({
        success: true,
        data: {
          valid: true,
          deviceId: legacyDevice.id,
          installationId: legacyDevice.installationId,
          installationName: legacyDevice.installation?.name ?? null,
          installationAddress: legacyDevice.installation?.address ?? null,
          currentGuardId: legacyDevice.currentGuardId,
          guardSelectedAt: legacyDevice.guardSelectedAt,
          pairedAt: legacyDevice.pairedAt,
        },
      });
    }

    // Fallback: unified DevicePairing table
    const unifiedDevice = await prisma.devicePairing.findFirst({
      where: { deviceToken: token },
      include: {
        installation: { select: { name: true, address: true } },
      },
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

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        deviceId: unifiedDevice.id,
        installationId: unifiedDevice.installationId,
        installationName: unifiedDevice.installation?.name ?? null,
        installationAddress: unifiedDevice.installation?.address ?? null,
        currentGuardId: (unifiedDevice as any).currentGuardId ?? null,
        guardSelectedAt: (unifiedDevice as any).guardSelectedAt ?? null,
        pairedAt: unifiedDevice.linkedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error validating device:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar dispositivo" },
      { status: 500 }
    );
  }
}
