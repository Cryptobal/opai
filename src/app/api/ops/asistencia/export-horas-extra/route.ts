import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const raw = String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const fromRaw = req.nextUrl.searchParams.get("from");
    const toRaw = req.nextUrl.searchParams.get("to");
    const installationId = req.nextUrl.searchParams.get("installationId") || undefined;
    const guardiaId = req.nextUrl.searchParams.get("guardiaId") || undefined;

    if (!fromRaw || !toRaw) {
      return NextResponse.json(
        { success: false, error: "Parámetros from y to son requeridos (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    const from = parseDateOnly(fromRaw);
    const to = parseDateOnly(toRaw);

    const rows = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: from, lte: to },
        plannedGuardiaId: { not: null },
        overtimeMinutes: { gt: 0 },
        ...(installationId ? { installationId } : {}),
        ...(guardiaId
          ? {
              OR: [{ plannedGuardiaId: guardiaId }, { actualGuardiaId: guardiaId }],
            }
          : {}),
      },
      include: {
        installation: {
          select: { name: true },
        },
        puesto: {
          select: { name: true, shiftStart: true, shiftEnd: true },
        },
        plannedGuardia: {
          select: {
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        actualGuardia: {
          select: {
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { installation: { name: "asc" } }, { puesto: { name: "asc" } }],
    });

    const header = [
      "fecha",
      "instalacion",
      "puesto",
      "slot",
      "guardia_planificado",
      "rut_planificado",
      "guardia_asistio",
      "rut_asistio",
      "hora_entrada_real",
      "hora_salida_real",
      "horario_planificado",
      "horas_planificadas",
      "horas_trabajadas",
      "horas_extra",
      "minutos_atraso",
      "fuente_entrada",
      "fuente_salida",
      "estado_asistencia",
    ];

    const csvLines = [
      header.join(","),
      ...rows.map((row) => {
        const plannedName = row.plannedGuardia
          ? `${row.plannedGuardia.persona.firstName} ${row.plannedGuardia.persona.lastName}`
          : "";
        const actualName = row.actualGuardia
          ? `${row.actualGuardia.persona.firstName} ${row.actualGuardia.persona.lastName}`
          : "";
        return [
          row.date.toISOString().slice(0, 10),
          row.installation.name,
          row.puesto.name,
          row.slotNumber,
          plannedName,
          row.plannedGuardia?.persona.rut ?? "",
          actualName,
          row.actualGuardia?.persona.rut ?? "",
          row.checkInAt ? row.checkInAt.toISOString() : "",
          row.checkOutAt ? row.checkOutAt.toISOString() : "",
          `${row.plannedShiftStart ?? row.puesto.shiftStart}-${row.plannedShiftEnd ?? row.puesto.shiftEnd}`,
          (row.plannedMinutes / 60).toFixed(2),
          (row.workedMinutes / 60).toFixed(2),
          (row.overtimeMinutes / 60).toFixed(2),
          row.lateMinutes,
          row.checkInSource ?? "none",
          row.checkOutSource ?? "none",
          row.attendanceStatus,
        ]
          .map(escapeCsv)
          .join(",");
      }),
    ];

    const csv = csvLines.join("\n");
    const fileName = `horas-extra-${fromRaw}-a-${toRaw}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[OPS] Error exporting overtime:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar horas extra" },
      { status: 500 }
    );
  }
}
