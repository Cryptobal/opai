import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeviceFromToken } from "@/lib/device-auth";
import { bindDeviceCurrentGuard } from "@/lib/devices/device-guards";

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromToken(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no autorizado" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const guardId = (body as { guardId?: string | null } | null)?.guardId ?? null;

    if (guardId) {
      const guard = await prisma.opsGuardia.findFirst({
        where: {
          id: guardId,
          tenantId: device.tenantId,
          status: "active",
          isBlacklisted: false,
        },
        select: { id: true },
      });
      if (!guard) {
        return NextResponse.json(
          { success: false, error: "Guardia no válido para este dispositivo" },
          { status: 400 },
        );
      }
    }

    await bindDeviceCurrentGuard({
      deviceId: device.id,
      tenantId: device.tenantId,
      installationId: device.installationId,
      previousGuardId: device.currentGuardId,
      guardId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[devices/set-guard] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al asignar guardia" },
      { status: 500 },
    );
  }
}
