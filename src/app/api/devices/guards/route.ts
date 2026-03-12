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
    const guards: { id: string; name: string; code: string | null; isTurnoExtra: boolean }[] = [];

    for (const a of assignments) {
      if (seen.has(a.guardiaId)) continue;
      seen.add(a.guardiaId);
      const g = a.guardia;
      const name = `${g.persona?.firstName || ""} ${g.persona?.lastName || ""}`.trim();
      guards.push({ id: g.id, name, code: g.code, isTurnoExtra: false });
    }

    // Also fetch approved turno_extra guards for today at this installation
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const turnosExtra = await prisma.opsTurnoExtra.findMany({
      where: {
        installationId: device.installationId,
        date: { gte: todayStart, lte: todayEnd },
        status: "approved",
        tipo: "turno_extra",
      },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    for (const t of turnosExtra) {
      if (seen.has(t.guardiaId)) continue; // already in regular list, keep isTurnoExtra: false
      seen.add(t.guardiaId);
      const g = t.guardia;
      const name = `${g.persona?.firstName || ""} ${g.persona?.lastName || ""}`.trim();
      guards.push({ id: g.id, name, code: g.code, isTurnoExtra: true });
    }

    // Sort: regular guards first (alphabetically by last name), then turno extra (alphabetically by last name)
    guards.sort((a, b) => {
      if (a.isTurnoExtra !== b.isTurnoExtra) {
        return a.isTurnoExtra ? 1 : -1;
      }
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
