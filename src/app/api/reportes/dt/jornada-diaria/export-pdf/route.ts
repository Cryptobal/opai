import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { JornadaDiariaPdf } from "@/components/reportes-dt/JornadaDiariaPdf";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { from, to, installationId } = await request.json();
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: new Date(Date.UTC(fy, fm - 1, fd)), lte: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59)) },
      deletedAt: null,
      attendanceStatus: "asistio",
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        workedMinutes: true,
        plannedMinutes: true,
        overtimeMinutes: true,
        checkInAt: true,
        checkOutAt: true,
        plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
        marcacionEntrada: { select: { timestamp: true, isModified: true, atrasoMinutos: true } },
        marcacionSalida: { select: { timestamp: true, isModified: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    const buffer = await renderToBuffer(
      JornadaDiariaPdf({ records, from, to })
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="jornada-diaria-${from}-${to}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-pdf jornada-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
