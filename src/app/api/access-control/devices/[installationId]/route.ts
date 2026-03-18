import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const devices = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.findMany({
          where: { installationId },
          orderBy: { createdAt: "desc" },
        }),
      null
    );

    if (devices === null) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Las tablas de control de acceso aún no existen. Ejecute la migración de base de datos.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, data: devices });
  } catch (error) {
    console.error("[AccessControl] Error fetching devices:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener dispositivos" },
      { status: 500 }
    );
  }
}
