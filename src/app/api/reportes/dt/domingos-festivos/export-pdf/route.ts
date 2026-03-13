import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { DomingosFestivosPdf } from "@/components/reportes-dt/DomingosFestivosPdf";

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
      date: {
        gte: new Date(Date.UTC(fy, fm - 1, fd)),
        lte: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59)),
      },
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
        plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        marcacionEntrada: { select: { timestamp: true } },
        marcacionSalida: { select: { timestamp: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    const filtered = records.filter((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      const dayOfWeek = r.date.getUTCDay();
      return dayOfWeek === 0 || FERIADOS_CL_2026.includes(dateStr);
    });

    const pdfRecords = filtered.map((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      return {
        ...r,
        esDomingo: r.date.getUTCDay() === 0,
        esFeriado: FERIADOS_CL_2026.includes(dateStr),
      };
    });

    const buffer = await renderToBuffer(
      DomingosFestivosPdf({ records: pdfRecords, from, to })
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="domingos-festivos-${from}-${to}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-pdf domingos-festivos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
