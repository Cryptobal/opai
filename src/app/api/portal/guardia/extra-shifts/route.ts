import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import type { GuardExtraShift } from "@/lib/guard-portal";
import { EXTRA_SHIFT_STATUS_LABELS } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const turnosExtra = await prisma.opsTurnoExtra.findMany({
      where: { guardiaId: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      include: {
        installation: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });

    const data: GuardExtraShift[] = turnosExtra.map((te) => {
      const dateStr = te.date instanceof Date
        ? te.date.toISOString().split("T")[0]
        : String(te.date).split("T")[0];

      return {
        id: te.id,
        date: dateStr,
        installationName: te.installation?.name ?? "Sin instalación",
        hours: te.horasExtra ? Number(te.horasExtra) : 0,
        amountClp: Number(te.amountClp),
        status: te.status as GuardExtraShift["status"],
        statusLabel:
          EXTRA_SHIFT_STATUS_LABELS[te.status]?.label ?? te.status,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Extra shifts error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener turnos extra" },
      { status: 500 },
    );
  }
}
