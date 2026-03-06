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

    const device = await safeAccessControlQuery(
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

    if (!device || !device.isActive) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no válido o desvinculado" },
        { status: 401 }
      );
    }

    // Update last activity and IP
    const forwardedFor = request.headers.get("x-forwarded-for");
    const lastIp = forwardedFor?.split(",")[0]?.trim() ?? null;

    await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.update({
          where: { id: device.id },
          data: {
            lastActivityAt: new Date(),
            lastIp,
          },
        }),
      null
    );

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        deviceId: device.id,
        installationId: device.installationId,
        installationName: device.installation?.name ?? null,
        installationAddress: device.installation?.address ?? null,
        currentGuardId: device.currentGuardId,
        guardSelectedAt: device.guardSelectedAt,
        pairedAt: device.pairedAt,
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
