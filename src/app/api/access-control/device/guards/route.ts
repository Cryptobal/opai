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

    // Fetch guards assigned to this device's installation
    const assignments = await prisma.opsAsignacionGuardia.findMany({
      where: {
        installationId: device.installationId,
        isActive: true,
        guardia: { status: "active" },
      },
      select: {
        guardia: {
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
        },
      },
      orderBy: {
        guardia: {
          persona: {
            lastName: "asc",
          },
        },
      },
    });

    // Deduplicate (a guard may have multiple assignments)
    const seen = new Set<string>();
    const guards = assignments
      .map((a) => a.guardia)
      .filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
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
