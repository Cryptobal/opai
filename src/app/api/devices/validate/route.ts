import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeviceFromToken } from "@/lib/device-auth";

export async function GET(request: NextRequest) {
  try {
    const device = await getDeviceFromToken(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no autorizado" },
        { status: 401 }
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    await prisma.devicePairing.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        lastIpAddress: ip,
      },
    });

    const full = await prisma.devicePairing.findUnique({
      where: { id: device.id },
      include: {
        installation: { select: { name: true } },
        currentGuard: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const currentGuardName = full?.currentGuard
      ? `${full.currentGuard.persona?.firstName || ""} ${full.currentGuard.persona?.lastName || ""}`.trim()
      : null;

    return NextResponse.json({
      success: true,
      data: {
        id: device.id,
        installationId: device.installationId,
        installationName: full?.installation?.name || "",
        tenantId: device.tenantId,
        portalRondasEnabled: device.portalRondasEnabled,
        portalAccesoEnabled: device.portalAccesoEnabled,
        currentGuardId: device.currentGuardId,
        currentGuardName,
        name: device.name,
        status: device.status,
      },
    });
  } catch (error) {
    console.error("[devices/validate] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar dispositivo" },
      { status: 500 }
    );
  }
}
