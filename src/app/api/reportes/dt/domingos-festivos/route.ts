/**
 * GET /api/reportes/dt/domingos-festivos?from=YYYY-MM-DD&to=YYYY-MM-DD&installationId=...
 * Devuelve registros de asistencia que corresponden a domingos o feriados chilenos.
 * Art. 38 Código del Trabajo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

const FERIADOS_CL_2026 = [
  "2026-01-01",
  "2026-04-03",
  "2026-04-04",
  "2026-05-01",
  "2026-05-21",
  "2026-06-20",
  "2026-06-29",
  "2026-07-16",
  "2026-08-15",
  "2026-09-18",
  "2026-09-19",
  "2026-10-12",
  "2026-10-31",
  "2026-11-01",
  "2026-12-08",
  "2026-12-25",
];

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
      attendanceStatus: "asistio",
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        workedMinutes: true,
        checkInAt: true,
        checkOutAt: true,
        plannedGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        marcacionEntrada: { select: { timestamp: true } },
        marcacionSalida: { select: { timestamp: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    // Filtrar solo domingos y feriados
    const filtered = records.filter((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      const dayOfWeek = r.date.getUTCDay(); // 0 = Sunday
      return dayOfWeek === 0 || FERIADOS_CL_2026.includes(dateStr);
    });

    const data = filtered.map((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      const esDomingo = r.date.getUTCDay() === 0;
      const esFeriado = FERIADOS_CL_2026.includes(dateStr);
      return {
        date: dateStr,
        esDomingo,
        esFeriado,
        workedMinutes: r.workedMinutes,
        checkInAt: r.checkInAt?.toISOString() ?? null,
        checkOutAt: r.checkOutAt?.toISOString() ?? null,
        plannedGuardia: r.plannedGuardia,
        installation: r.installation,
        puesto: r.puesto,
        marcacionEntrada: r.marcacionEntrada
          ? { timestamp: r.marcacionEntrada.timestamp.toISOString() }
          : null,
        marcacionSalida: r.marcacionSalida
          ? { timestamp: r.marcacionSalida.timestamp.toISOString() }
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[DT] Error domingos-festivos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
