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

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // empty body is valid for heartbeat
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    await prisma.devicePairing.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        lastBatteryLevel: typeof body.batteryLevel === "number" ? body.batteryLevel : undefined,
        lastConnectionType: typeof body.connectionType === "string" ? body.connectionType : undefined,
        lastIpAddress: ip,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[devices/heartbeat] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar heartbeat" },
      { status: 500 }
    );
  }
}
