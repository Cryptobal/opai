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
        }),
      null
    );

    if (!device || !device.isActive) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no válido o desvinculado" },
        { status: 401 }
      );
    }

    // Fetch guards (OpsGuardia with persona info) assigned to this installation
    // or active guards for this tenant
    const guards = await prisma.opsGuardia.findMany({
      where: {
        tenantId: device.tenantId,
        status: "active",
      },
      select: {
        id: true,
        code: true,
        persona: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        persona: {
          lastName: "asc",
        },
      },
    });

    const formattedGuards = guards.map((g) => ({
      id: g.id,
      name: `${g.persona.firstName} ${g.persona.lastName}`,
      code: g.code,
      role: "guardia",
    }));

    return NextResponse.json({ success: true, data: formattedGuards });
  } catch (error) {
    console.error("[AccessControl] Error fetching guards:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener guardias" },
      { status: 500 }
    );
  }
}
