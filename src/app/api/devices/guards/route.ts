import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeviceFromToken } from "@/lib/device-auth";

export async function GET(request: NextRequest) {
  try {
    const device = await getDeviceFromToken(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no autorizado" },
        { status: 401 }
      );
    }

    const assignments = await prisma.opsAsignacionGuardia.findMany({
      where: {
        installationId: device.installationId,
        isActive: true,
        guardia: { status: "active" },
      },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const seen = new Set<string>();
    const guards: { id: string; name: string; code: string | null }[] = [];

    for (const a of assignments) {
      if (seen.has(a.guardiaId)) continue;
      seen.add(a.guardiaId);
      const g = a.guardia;
      const name = `${g.persona?.firstName || ""} ${g.persona?.lastName || ""}`.trim();
      guards.push({ id: g.id, name, code: g.code });
    }

    guards.sort((a, b) => {
      const lastA = a.name.split(" ").slice(-1)[0] || "";
      const lastB = b.name.split(" ").slice(-1)[0] || "";
      return lastA.localeCompare(lastB, "es");
    });

    return NextResponse.json({ success: true, data: guards });
  } catch (error) {
    console.error("[devices/guards] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener guardias" },
      { status: 500 }
    );
  }
}
