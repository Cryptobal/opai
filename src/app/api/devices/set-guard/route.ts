import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeviceFromToken } from "@/lib/device-auth";

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromToken(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { guardId } = body as { guardId: string | null };

    const previousGuardId = device.currentGuardId;

    await prisma.$transaction([
      prisma.devicePairing.update({
        where: { id: device.id },
        data: {
          currentGuardId: guardId,
          guardSelectedAt: new Date(),
        },
      }),
      prisma.guardSelectionLog.create({
        data: {
          tenantId: device.tenantId,
          devicePairingId: device.id,
          installationId: device.installationId,
          fromGuardId: previousGuardId,
          toGuardId: guardId,
          timestamp: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[devices/set-guard] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al asignar guardia" },
      { status: 500 }
    );
  }
}
