import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { listDeviceGuards } from "@/lib/devices/device-guards";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token de autorización requerido" },
        { status: 401 },
      );
    }

    const query = request.nextUrl.searchParams.get("q") ?? undefined;

    const legacyDevice = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.findUnique({
          where: { deviceToken: token },
        }),
      null,
    );

    let installationId: string | null = null;
    let tenantId: string | null = null;

    if (legacyDevice && legacyDevice.isActive) {
      installationId = legacyDevice.installationId;
      tenantId = legacyDevice.tenantId;
    } else {
      const unifiedDevice = await prisma.devicePairing.findFirst({
        where: { deviceToken: token, status: "ACTIVE" },
        select: { installationId: true, tenantId: true },
      });
      if (unifiedDevice) {
        installationId = unifiedDevice.installationId;
        tenantId = unifiedDevice.tenantId;
      }
    }

    if (!installationId || !tenantId) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no válido o desvinculado" },
        { status: 401 },
      );
    }

    const guards = await listDeviceGuards({ tenantId, installationId, query });

    return NextResponse.json({ success: true, data: guards });
  } catch (error) {
    console.error("[AccessControl] Error fetching guards:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener guardias" },
      { status: 500 },
    );
  }
}
