/**
 * GET /api/reportes/dt/asistencia-diaria?from=YYYY-MM-DD&to=YYYY-MM-DD&installationId=...
 * Devuelve registros de asistencia para el reporte DT.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const installationId = sp.get("installationId");

    if (!from || !to) {
      return NextResponse.json({ success: false, error: "Parámetros from/to requeridos" }, { status: 400 });
    }

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        id: true,
        date: true,
        attendanceStatus: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        plannedMinutes: true,
        overtimeMinutes: true,
        marcacionEntradaId: true,
        marcacionSalidaId: true,
        plannedGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
        marcacionEntrada: {
          select: {
            timestamp: true, metodoId: true, gpsStatus: true,
            isModified: true, atrasoMinutos: true,
            opposedAt: true, consolidatedAt: true,
          },
        },
        marcacionSalida: {
          select: {
            timestamp: true, metodoId: true, gpsStatus: true,
            isModified: true,
            opposedAt: true, consolidatedAt: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { plannedGuardia: { persona: { lastName: "asc" } } }],
    });

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("[DT] Error asistencia-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
