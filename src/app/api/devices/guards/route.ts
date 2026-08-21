import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromToken } from "@/lib/device-auth";
import { listDeviceGuards } from "@/lib/devices/device-guards";

export async function GET(request: NextRequest) {
  try {
    const device = await getDeviceFromToken(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no autorizado" },
        { status: 401 },
      );
    }

    const query = request.nextUrl.searchParams.get("q") ?? undefined;
    const guards = await listDeviceGuards({
      tenantId: device.tenantId,
      installationId: device.installationId,
      query,
    });

    return NextResponse.json({ success: true, data: guards });
  } catch (error) {
    console.error("[devices/guards] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener guardias" },
      { status: 500 },
    );
  }
}
