import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ installationId: string; deviceId: string }> }
) {
  try {
    const { deviceId } = await params;

    const updated = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.update({
          where: { id: deviceId },
          data: { isActive: false },
        }),
      null
    );

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Las tablas de control de acceso aún no existen. Ejecute la migración de base de datos.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error deactivating device:", error);
    return NextResponse.json(
      { success: false, error: "Error al desvincular dispositivo" },
      { status: 500 }
    );
  }
}
