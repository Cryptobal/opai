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

    const device = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.findUnique({
          where: { deviceToken: token },
        }),
      null
    );

    if (!device || !device.isActive) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no válido o desvinculado" },
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

    await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.update({
          where: { id: device.id },
          data: {
            currentGuardId: guardId,
            guardSelectedAt: new Date(),
          },
        }),
      null
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error setting guard:", error);
    return NextResponse.json(
      { success: false, error: "Error al asignar guardia" },
      { status: 500 }
    );
  }
}
